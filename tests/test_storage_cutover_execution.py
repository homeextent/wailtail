import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
import urllib.parse

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
import storage_cutover_execution as E

SPEC = importlib.util.spec_from_file_location('fixtures', Path(__file__).with_name('test_storage_cutover.py'))
F = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(F)


def row():
    return F.row()


def plan(r):
    commit, recovery = E.C.prepare_reference_writes([r], F.docs(r))
    return {'copies': [E.C.copy_operation(r)], 'reference_commit': commit, 'recovery': recovery}


class ExecutionTests(unittest.TestCase):
    def test_default_prepare_never_uses_cloud_write_and_backs_up_tokens_privately(self):
        r = row()
        cloud = Mock()
        original = dict(F.metadata(r), metadata={E.TOKEN_KEY: 'PRIVATE-TOKEN'}, acl=[])
        def get(url, **kwargs):
            if 'projection=full' in url:
                return original
            if url.startswith(E.C.GCS):
                return None
            return next(d for d in F.docs(r) if url.endswith(d['name']))
        cloud.get.side_effect = get
        def rules_read(name):
            if '/releases/' in name:
                return {'name':name,'rulesetName':f'projects/{E.C.PROJECT}/rulesets/test-rules'}
            return {'name':name,'source':{'files':[{'content':'rules'}]}}
        cloud.rules_read.side_effect = rules_read
        cloud.listed.side_effect = lambda endpoint, *args: [original] if endpoint.startswith(E.C.GCS) else []
        with tempfile.TemporaryDirectory() as tmp:
            output = E.C.make_output(Path(tmp)/'package')
            with patch.object(E.R, 'verify_backup'), patch.object(E.shutil,'copytree'), patch.object(E.shutil,'copy2'), patch.object(E, 'documents', return_value=F.docs(r)), \
                 patch.object(E.subprocess, 'check_output', side_effect=['', 'candidate', 'tree']):
                report = E.prepare(Path(tmp), output, cloud, [r])
            cloud.write.assert_not_called()
            self.assertEqual(report['cloud_write_requests'], 0)
            self.assertNotIn('PRIVATE-TOKEN', json.dumps(report))
            self.assertIn('PRIVATE-TOKEN', (output/'private-original-metadata.json').read_text())
            self.assertEqual((output/'private-original-metadata.json').stat().st_mode & 0o777, 0o600)
            saved = E.R.read_json(output/'private-plan.json')
            with patch.object(E.subprocess,'check_output',side_effect=['tree','']):
                self.assertEqual(E.load_package(output,E.digest(saved),[r]),saved)
            with self.assertRaisesRegex(E.C.Blocked,'Exact approved plan hash'):
                E.load_package(output,'wrong-hash',[r])
            (output/'private-original-documents.json').write_text('{}')
            with patch.object(E.subprocess,'check_output',side_effect=['tree','']):
                with self.assertRaisesRegex(E.C.Blocked,'Private backup drift'):
                    E.load_package(output,E.digest(saved),[r])

    def test_copy_continuation_preserves_guards_and_verified_resume_skips_write(self):
        r = row()
        p = plan(r)
        cloud = Mock()
        cloud.get.side_effect = [F.metadata(r), None]
        cloud.write.side_effect = [{'done': False, 'rewriteToken': 'continuation'},
                                   {'done': True, 'resource': {'name': r['destination_path'], 'generation': '987', 'metageneration': '1'}}]
        with tempfile.TemporaryDirectory() as tmp:
            journal = E.Journal(Path(tmp)/'journal', 'hash')
            with patch.object(E, 'verify_destination') as verify:
                E.copy_public(p, [r], cloud, journal)
                E.copy_public(p, [r], cloud, E.Journal(journal.path, 'hash'))
            self.assertEqual(cloud.write.call_count, 2)
            first, second = cloud.write.call_args_list
            self.assertEqual(first.args[2], second.args[2])
            self.assertIn('ifGenerationMatch=0', first.args[1])
            self.assertIn('ifSourceGenerationMatch=123', second.args[1])
            self.assertIn('rewriteToken=continuation', second.args[1])
            self.assertEqual(verify.call_count, 2)

    def test_collision_and_partial_write_fail_closed(self):
        r = row()
        cloud = Mock()
        cloud.get.side_effect = [F.metadata(r), {'generation': 'other'}]
        with tempfile.TemporaryDirectory() as tmp:
            journal = E.Journal(Path(tmp)/'journal', 'hash')
            with self.assertRaisesRegex(E.C.Blocked, 'collision'):
                E.copy_public(plan(r), [r], cloud, journal)
            cloud.write.assert_not_called()
            with self.assertRaises(RuntimeError):
                journal.perform('ambiguous', lambda: (_ for _ in ()).throw(RuntimeError('network')))
            with self.assertRaisesRegex(E.C.Blocked, 'Uncertain interrupted'):
                E.Journal(journal.path, 'hash')
            with self.assertRaisesRegex(E.C.Blocked, 'Journal plan mismatch'):
                E.Journal(journal.path, 'other-plan')

    def test_reference_commit_atomic_and_drift_prevents_write(self):
        r = row()
        p = plan(r)
        cloud = Mock()
        cloud.write.return_value = {'writeResults': [{'updateTime': 'after'}]}
        write = p['reference_commit']['writes'][0]
        cloud.get.return_value = {'updateTime': 'after', 'fields': write['update']['fields']}
        with tempfile.TemporaryDirectory() as tmp:
            journal = E.Journal(Path(tmp)/'journal', 'hash')
            journal.append('copy:'+r['destination_path'], 'done', {'generation': '987', 'metageneration': '1'})
            with patch.object(E, 'verify_destination'), patch.object(E, 'fresh_metadata'), \
                 patch.object(E, 'documents', return_value=F.docs(r)):
                E.references(p, [r], cloud, journal)
            cloud.write.assert_called_once_with('POST', E.C.FS+':commit', p['reference_commit'])
            self.assertEqual(journal.result('commit-references')['update_times'], ['after'])
            cloud.write.reset_mock()
            with self.assertRaisesRegex(E.C.Blocked, 'already completed'):
                E.references(p, [r], cloud, journal)
            cloud.write.assert_not_called()
        with tempfile.TemporaryDirectory() as tmp:
            journal = E.Journal(Path(tmp)/'journal', 'hash')
            journal.append('copy:'+r['destination_path'], 'done', {})
            changed = F.docs(r)
            changed[-1]['updateTime'] = 'different'
            with patch.object(E, 'verify_destination'), patch.object(E, 'fresh_metadata'), \
                 patch.object(E, 'documents', return_value=changed):
                with self.assertRaisesRegex(E.C.Blocked, 'Fresh reference'):
                    E.references(p, [r], cloud, journal)
            cloud.write.assert_not_called()

    def test_recovery_uses_post_commit_revisions_and_preserves_original_fields(self):
        r = row()
        p = plan(r)
        cloud = Mock()
        cloud.get.side_effect = [{'updateTime':'after'}, {'updateTime':'recovered', 'fields':p['recovery']['documents'][0]['original_fields']}]
        cloud.write.return_value = {'writeResults': [{'updateTime': 'recovered'}]}
        with tempfile.TemporaryDirectory() as tmp:
            journal = E.Journal(Path(tmp)/'journal', 'hash')
            journal.append('commit-references', 'done', {'update_times':['after']})
            with patch.object(E, 'anonymous_status', return_value=206):
                E.recover_references(p, cloud, journal)
            restored = cloud.write.call_args.args[2]['writes'][0]
            self.assertEqual(restored['currentDocument'], {'updateTime':'after'})
            self.assertEqual(restored['update']['fields'], p['recovery']['documents'][0]['original_fields'])
            cloud.write.reset_mock()
            journal.append('revoke:any', 'done', {})
            with self.assertRaisesRegex(E.C.Blocked, 'after token revocation'):
                E.recover_references(p, cloud, journal)
            cloud.write.assert_not_called()

    def test_recovery_newer_edits_and_unreadable_originals_block(self):
        r = row()
        for revision, status in [('newer',206), ('after',403)]:
            with tempfile.TemporaryDirectory() as tmp:
                journal = E.Journal(Path(tmp)/'journal', 'hash')
                journal.append('commit-references','done',{'update_times':['after']})
                cloud = Mock()
                cloud.get.return_value = {'updateTime':revision}
                with patch.object(E,'anonymous_status',return_value=status):
                    with self.assertRaises(E.C.Blocked):
                        E.recover_references(plan(r),cloud,journal)
                cloud.write.assert_not_called()

    def test_revoke_requires_strict_denial_and_removes_only_token_key(self):
        r = row()
        p = plan(r)
        original = dict(F.metadata(r), metadata={E.TOKEN_KEY:'SECRET', 'keep':'value'})
        after = dict(original, metadata={'keep':'value'}, metageneration='2')
        for no_token_status in (206,403):
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                E.C.private_json(root/'private-original-metadata.json',[original])
                journal = E.Journal(root/'journal','hash')
                journal.append('commit-references','done',{'update_times':['after']})
                journal.append('copy:'+r['destination_path'],'done',{})
                cloud = Mock()
                cloud.get.side_effect = [{'updateTime':'after'},original,after]
                cloud.write.return_value = after
                with patch.object(E,'verify_destination'), patch.object(E,'anonymous_status',return_value=no_token_status):
                    if no_token_status == 206:
                        with self.assertRaisesRegex(E.C.Blocked,'restrict rules first'):
                            E.revoke(p,[r],cloud,journal,root)
                        cloud.write.assert_not_called()
                    else:
                        E.revoke(p,[r],cloud,journal,root)
                        call = cloud.write.call_args
                        self.assertEqual(call.args[0],'PATCH')
                        self.assertEqual(call.args[2],{'metadata':{E.TOKEN_KEY:None}})
                        self.assertIn('ifGenerationMatch=123',call.args[1])
                        self.assertIn('ifMetagenerationMatch=1',call.args[1])

    def test_missing_approval_blocks_before_auth_and_preserves_other_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lock = root/'.execution-lock'
            lock.write_text('other-process')
            with patch.object(sys,'argv',['exec','copy','--package',tmp]), patch.object(E.C,'obtain_token') as auth:
                self.assertEqual(E.main(),1)
                auth.assert_not_called()
                self.assertEqual(lock.read_text(),'other-process')
            with patch.object(sys,'argv',['exec','copy','--package',tmp,'--approved-plan-sha256','hash',
                                         '--execute-approved-live-operation','--controlled-window-confirmed',
                                         '--verified-package-backup',tmp+'-mirror','--off-device-backup-confirmed']), \
                 patch.object(E,'load_package',return_value={}), patch.object(E,'verify_package_backup',return_value=root), patch.object(E.C,'obtain_token') as auth:
                self.assertEqual(E.main(),1)
                self.assertEqual(lock.read_text(),'other-process')
                auth.assert_not_called()

    def test_package_copy_verification_and_mirrored_journal(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, mirror = Path(tmp)/'local', Path(tmp)/'independent'
            root.mkdir()
            mirror.mkdir()
            for directory in (root,mirror):
                (directory/'private-plan.json').write_text('private')
                (directory/'integrity-sha256.json').write_text(json.dumps({'private-plan.json':E.file_hash(directory/'private-plan.json')}))
            self.assertEqual(E.verify_package_backup(root,mirror),mirror)
            journal = E.Journal(root/'journal','hash',mirror/'journal')
            journal.perform('operation',lambda:{'ok':True})
            self.assertEqual((root/'journal').read_bytes(),(mirror/'journal').read_bytes())
            (mirror/'journal').write_text('different')
            with self.assertRaisesRegex(E.C.Blocked,'Journal mirror mismatch'):
                E.Journal(root/'journal','hash',mirror/'journal')
            (mirror/'private-plan.json').write_text('corrupt')
            with self.assertRaisesRegex(E.C.Blocked,'checksum mismatch'):
                E.verify_package_backup(root,mirror)

    def test_rules_backup_restricts_project_and_never_writes(self):
        cloud = E.Cloud('SECRET',ipv4_only=True)
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = b'{"name":"test"}'
        cloud.opener.open = Mock(return_value=response)
        cloud.rules_read(f'projects/{E.C.PROJECT}/releases/cloud.firestore/{E.C.DATABASE}')
        request = cloud.opener.open.call_args.args[0]
        self.assertEqual(request.get_method(),'GET')
        self.assertEqual(urllib.parse.urlsplit(request.full_url).hostname,'firebaserules.googleapis.com')
        with self.assertRaisesRegex(E.C.Blocked,'Unexpected rules backup'):
            cloud.rules_read('projects/other/rulesets/secret')
        with self.assertRaisesRegex(E.C.Blocked,'Unexpected rules backup'):
            cloud.rules_read(f'projects/{E.C.PROJECT}/rulesets/../../other')

    def test_cloud_write_error_never_leaks_or_retries(self):
        cloud = E.Cloud('SECRET',ipv4_only=True)
        cloud.opener.open = Mock(side_effect=RuntimeError('SECRET-URL'))
        with self.assertRaisesRegex(E.C.Blocked,'uncertain/rejected') as error:
            cloud.write('POST',E.C.FS+':commit',{'writes':[]})
        self.assertNotIn('SECRET',str(error.exception))
        self.assertEqual(cloud.opener.open.call_count,1)
        with self.assertRaisesRegex(E.C.Blocked,'Unexpected write target'):
            cloud.write('DELETE',E.C.GCS,{})


if __name__ == '__main__':
    unittest.main()
