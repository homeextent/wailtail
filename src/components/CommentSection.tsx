import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Comment, Auction } from '../types';
import { postComment, toggleUpvoteComment, editComment, deleteComment } from '../services/auctionService';
import { formatCurrency, formatRelativeTime } from '../utils/formatters';
import { 
  MessageSquare, 
  ThumbsUp, 
  Reply, 
  Send, 
  Gavel, 
  ShieldCheck, 
  LogIn, 
  Sparkles,
  AlertCircle,
  Filter,
  Pencil,
  Trash2,
  Check,
  X,
  CheckCircle2,
  CornerDownRight
} from 'lucide-react';

interface CommentSectionProps {
  auction: Auction;
  comments: Comment[];
  onOpenAuth: () => void;
}

export const CommentSection: React.FC<CommentSectionProps> = ({
  auction,
  comments,
  onOpenAuth
}) => {
  const { user, userProfile, isEmailVerified, isAdmin } = useAuth();
  const [commentText, setCommentText] = useState('');
  const [replyToUser, setReplyToUser] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'comments' | 'bids' | 'seller'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Moderation states
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [editLoading, setEditLoading] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Seller / Admin Inline Reply state
  const [inlineReplyTargetId, setInlineReplyTargetId] = useState<string | null>(null);
  const [inlineReplyText, setInlineReplyText] = useState<string>('');
  const [submittingInlineReply, setSubmittingInlineReply] = useState<boolean>(false);

  // Check if current user is seller or administrator
  const isSeller = Boolean(
    userProfile?.role === 'seller' ||
    userProfile?.displayName?.toLowerCase().includes('seller') ||
    userProfile?.displayName?.toLowerCase().includes('wailtail') ||
    (user?.email && auction.sellerName && user.email.toLowerCase() === auction.sellerName.toLowerCase()) ||
    (auction.sellerName && auction.sellerName.toLowerCase() === 'wailtail' && userProfile?.displayName?.toLowerCase().includes('wailtail'))
  );
  const isSellerOrAdmin = Boolean(user && (isAdmin || isSeller || user.email?.toLowerCase() === 'jeremygoodmurphy@gmail.com'));

  // Group comments into top-level items and nested replies
  const { topLevelItems, repliesByParentId } = useMemo(() => {
    const repliesMap = new Map<string, Comment[]>();
    const topLevel: Comment[] = [];
    const commentIdSet = new Set(comments.map((c) => c.id));

    comments.forEach((c) => {
      if (c.replyToId && commentIdSet.has(c.replyToId)) {
        const list = repliesMap.get(c.replyToId) || [];
        list.push(c);
        repliesMap.set(c.replyToId, list);
      } else {
        topLevel.push(c);
      }
    });

    return { topLevelItems: topLevel, repliesByParentId: repliesMap };
  }, [comments]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userProfile) {
      setError('Please sign in to join the conversation.');
      return;
    }
    if (!isEmailVerified) {
      setError('Email verification required to post comments.');
      return;
    }
    if (!commentText.trim()) return;

    setError(null);
    setLoading(true);

    try {
      // Determine badge
      let badge: 'Seller' | 'Verified Bidder' | 'High Bidder' | 'Admin' | 'Member' = 'Verified Bidder';
      if (isAdmin || user.email?.toLowerCase() === 'jeremygoodmurphy@gmail.com') {
        badge = 'Admin';
      } else if (isSeller) {
        badge = 'Seller';
      } else if (auction.highBidderId === user.uid) {
        badge = 'High Bidder';
      }

      await postComment(auction.id, {
        userId: user.uid,
        userName: userProfile.displayName || user.displayName || 'Member',
        userEmail: user.email || undefined,
        userBadge: badge,
        text: commentText.trim(),
        replyToId: replyToUser || undefined
      });

      setCommentText('');
      setReplyToUser(null);
      setLoading(false);
      setActionNotice('Comment posted successfully.');
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      setLoading(false);
      setError(err.message || 'Failed to post comment.');
    }
  };

  // Submit official inline reply nested under a specific comment card
  const handlePostInlineReply = async (e: React.FormEvent, parentComment: Comment) => {
    e.preventDefault();
    if (!user || !userProfile) {
      onOpenAuth();
      return;
    }
    if (!inlineReplyText.trim()) return;

    setSubmittingInlineReply(true);
    setError(null);

    try {
      const badge: 'Seller' | 'Admin' = isAdmin || user.email?.toLowerCase() === 'jeremygoodmurphy@gmail.com' ? 'Admin' : 'Seller';
      const authorName = userProfile.displayName || (badge === 'Admin' ? 'Wailtail Admin' : (auction.sellerName || 'Seller'));

      await postComment(auction.id, {
        userId: user.uid,
        userName: authorName,
        userEmail: user.email || undefined,
        userBadge: badge,
        text: inlineReplyText.trim(),
        replyToId: parentComment.id
      });

      setInlineReplyText('');
      setInlineReplyTargetId(null);
      setSubmittingInlineReply(false);
      setActionNotice(`Official ${badge} response posted.`);
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      setSubmittingInlineReply(false);
      setError(err.message || 'Failed to submit reply.');
    }
  };

  const handleUpvote = async (commentId: string) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    await toggleUpvoteComment(commentId, user.uid);
  };

  const handleStartEdit = (item: Comment) => {
    setEditingCommentId(item.id);
    setEditingText(item.text);
    setConfirmDeleteId(null);
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditingText('');
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!editingText.trim()) return;
    setEditLoading(true);
    try {
      await editComment(commentId, editingText.trim());
      setEditingCommentId(null);
      setEditingText('');
      setActionNotice('Comment updated successfully.');
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      console.error('Error editing comment:', err);
      alert('Failed to update comment: ' + (err.message || 'Unknown error'));
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await deleteComment(commentId);
      setConfirmDeleteId(null);
      setActionNotice('Comment deleted successfully.');
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      console.error('Error deleting comment:', err);
      alert('Failed to delete comment: ' + (err.message || 'Unknown error'));
    }
  };

  const filteredTopLevel = topLevelItems.filter((c) => {
    if (filter === 'bids') return c.isBid;
    if (filter === 'comments') return !c.isBid;
    if (filter === 'seller') {
      const isDirectSeller = c.userBadge === 'Seller' || c.userName.toLowerCase().includes('seller') || c.userName.toLowerCase().includes('wailtail');
      const hasSellerReply = repliesByParentId.get(c.id)?.some((r) => r.userBadge === 'Seller' || r.userName.toLowerCase().includes('seller') || r.userName.toLowerCase().includes('wailtail'));
      return isDirectSeller || hasSellerReply;
    }
    return true;
  });

  return (
    <section id="qa" className="bg-white rounded-xl border border-zinc-200/90 shadow-sm overflow-hidden scroll-mt-24">
      {/* Header */}
      <div className="p-6 sm:p-8 border-b border-zinc-100 bg-zinc-50/50 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest font-bold text-red-700 mb-1 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Community & Bid Stream</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight font-serif">
            Public Q&A & Live Bid Activity ({comments.length})
          </h2>
          <p className="text-sm text-zinc-600 mt-1">
            Questions answered directly by the seller. Bids appear in real-time.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-zinc-200 shadow-sm text-xs font-semibold">
          <button
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              filter === 'all' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            All Activity
          </button>
          <button
            onClick={() => setFilter('comments')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              filter === 'comments' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Comments
          </button>
          <button
            onClick={() => setFilter('bids')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              filter === 'bids' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Bids Only
          </button>
          <button
            onClick={() => setFilter('seller')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              filter === 'seller' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Seller Q&A
          </button>
        </div>
      </div>

      {/* Main Comment / Bid Stream */}
      <div className="p-4 sm:p-8 space-y-4 divide-y divide-zinc-100">
        {actionNotice && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-semibold">{actionNotice}</span>
          </div>
        )}

        {filteredTopLevel.length === 0 ? (
          <div className="text-center py-12 text-zinc-400 text-sm">
            No entries found under this filter.
          </div>
        ) : (
          filteredTopLevel.map((item) => {
            const isUserUpvoted = user ? item.upvotedBy?.includes(user.uid) : false;
            const canModerate = Boolean(isAdmin || (user && user.uid === item.userId));
            const isEditing = editingCommentId === item.id;
            const isConfirmingDelete = confirmDeleteId === item.id;
            const nestedReplies = repliesByParentId.get(item.id) || [];
            
            // SPECIAL RENDER: BID ANNOUNCEMENT ROW
            if (item.isBid) {
              return (
                <div 
                  key={item.id} 
                  className="pt-4 first:pt-0"
                >
                  <div className="bg-[#182026] text-white rounded-lg p-3.5 sm:p-4 border border-zinc-800 flex items-center justify-between gap-3 shadow-sm hover:border-emerald-700/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                        <Gavel className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs sm:text-sm text-zinc-100">
                            {item.userName}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-semibold border border-zinc-700">
                            Bid Placed
                          </span>
                          <span className="text-[11px] text-zinc-400">
                            {formatRelativeTime(item.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-300 mt-0.5">
                          {item.text}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-base sm:text-lg font-black text-emerald-400 font-mono">
                          {item.bidAmount ? formatCurrency(item.bidAmount) : 'Bid'}
                        </div>
                      </div>

                      {/* Admin delete for bid records */}
                      {isAdmin && (
                        <div>
                          {isConfirmingDelete ? (
                            <div className="flex items-center gap-1 bg-red-950/80 p-1 rounded border border-red-800 text-[10px]">
                              <span className="text-red-200">Delete?</span>
                              <button
                                onClick={() => handleDelete(item.id)}
                                className="px-1.5 py-0.5 rounded bg-red-600 text-white font-bold hover:bg-red-700 cursor-pointer"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(item.id)}
                              className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                              title="Delete Bid Comment (Admin)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            // STANDARD RENDER: PUBLIC Q&A COMMENT
            const isItemSeller = item.userBadge === 'Seller' || item.userName.toLowerCase().includes('seller');
            const isItemAdmin = item.userBadge === 'Admin';
            const isItemHighBidder = item.userBadge === 'High Bidder';

            return (
              <div 
                key={item.id} 
                className={`pt-4 first:pt-0 ${
                  isItemSeller ? 'bg-amber-50/40 p-4 rounded-xl border border-amber-200/60 my-2' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left: Author info & Text */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs sm:text-sm text-zinc-900 font-sans">
                        {item.userName}
                      </span>

                      {/* User Badge */}
                      {isItemSeller && (
                        <span className="px-2 py-0.5 rounded bg-amber-600 text-white text-[10px] font-extrabold uppercase tracking-wide shadow-xs">
                          Seller
                        </span>
                      )}
                      {isItemAdmin && (
                        <span className="px-2 py-0.5 rounded bg-red-700 text-white text-[10px] font-bold uppercase tracking-wide">
                          Admin
                        </span>
                      )}
                      {isItemHighBidder && (
                        <span className="px-2 py-0.5 rounded bg-emerald-700 text-white text-[10px] font-bold uppercase tracking-wide">
                          High Bidder
                        </span>
                      )}
                      {!isItemSeller && !isItemAdmin && !isItemHighBidder && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 text-[10px] font-semibold border border-zinc-200">
                          {item.userBadge || 'Verified Bidder'}
                        </span>
                      )}

                      <span className="text-[11px] text-zinc-400">
                        {formatRelativeTime(item.timestamp)}
                      </span>

                      {item.isEdited && (
                        <span className="text-[10px] text-zinc-400 italic font-medium">
                          (edited)
                        </span>
                      )}
                    </div>

                    {/* Comment Body or Inline Edit Form */}
                    {isEditing ? (
                      <div className="mt-2 space-y-2 bg-zinc-50 p-3 rounded-lg border border-zinc-300">
                        <textarea
                          rows={3}
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          className="w-full p-2.5 text-xs sm:text-sm border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                          placeholder="Edit your comment..."
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            disabled={editLoading}
                            className="px-2.5 py-1 text-xs rounded border border-zinc-300 text-zinc-700 hover:bg-zinc-100 flex items-center gap-1 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Cancel</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(item.id)}
                            disabled={editLoading || !editingText.trim()}
                            className="px-3 py-1 text-xs rounded bg-zinc-900 hover:bg-black text-white font-bold flex items-center gap-1 shadow-sm disabled:opacity-50 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{editLoading ? 'Saving...' : 'Save Changes'}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-zinc-800 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                        {item.text}
                      </p>
                    )}
                  </div>

                  {/* Right Actions: Upvote, Prominent Seller Reply Button & Moderation */}
                  <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                    <button
                      onClick={() => handleUpvote(item.id)}
                      className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors border cursor-pointer ${
                        isUserUpvoted
                          ? 'bg-red-50 border-red-200 text-red-700 font-bold'
                          : 'bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-600'
                      }`}
                      title="Mark as Helpful (Upvote)"
                    >
                      <ThumbsUp className={`w-3.5 h-3.5 ${isUserUpvoted ? 'fill-red-600 text-red-600' : ''}`} />
                      <span>{item.upvotes || 0}</span>
                    </button>

                    {/* Prominent Reply Button for Sellers and Administrators */}
                    {isSellerOrAdmin ? (
                      <button
                        onClick={() => {
                          setInlineReplyTargetId(inlineReplyTargetId === item.id ? null : item.id);
                          setInlineReplyText('');
                        }}
                        className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 ${
                          inlineReplyTargetId === item.id
                            ? 'bg-amber-600 text-white border border-amber-700 ring-2 ring-amber-400/50'
                            : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                        }`}
                        title="Post official seller or administrator response"
                      >
                        <Reply className="w-3.5 h-3.5 text-amber-800" />
                        <span>Reply</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setInlineReplyTargetId(inlineReplyTargetId === item.id ? null : item.id);
                          setInlineReplyText('');
                        }}
                        className="p-1.5 rounded text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
                        title={`Reply to ${item.userName}`}
                      >
                        <Reply className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Moderation Controls (Author or Admin) */}
                    {canModerate && !isEditing && (
                      <div className="flex items-center gap-1 pl-1 border-l border-zinc-200">
                        <button
                          onClick={() => handleStartEdit(item)}
                          className="p-1.5 rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
                          title="Edit Comment"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1 bg-red-50 p-1 rounded border border-red-200 text-[10px]">
                            <span className="text-red-700 font-semibold">Delete?</span>
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="px-1.5 py-0.5 rounded bg-red-600 text-white font-bold hover:bg-red-700 cursor-pointer"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 hover:bg-zinc-300 cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(item.id)}
                            className="p-1.5 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Delete Comment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Inline Seller/Admin Reply Input Box (Opens right beneath user's question) */}
                {inlineReplyTargetId === item.id && (
                  <form 
                    onSubmit={(e) => handlePostInlineReply(e, item)} 
                    className="mt-3.5 p-3.5 sm:p-4 bg-amber-50/90 border border-amber-300 rounded-xl space-y-3 shadow-sm animate-in fade-in slide-in-from-top-1"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-amber-200/80 pb-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide text-white shadow-xs ${
                          isAdmin ? 'bg-red-700' : 'bg-amber-600'
                        }`}>
                          {isAdmin ? 'ADMIN OFFICIAL RESPONSE' : 'SELLER OFFICIAL RESPONSE'}
                        </span>
                        <span className="text-amber-800">
                          Replying to <strong className="text-amber-950">{item.userName}</strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setInlineReplyTargetId(null)}
                        className="text-zinc-400 hover:text-zinc-700 text-xs font-medium cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>

                    <textarea
                      rows={3}
                      autoFocus
                      value={inlineReplyText}
                      onChange={(e) => setInlineReplyText(e.target.value)}
                      placeholder={`Write official ${isAdmin ? 'admin' : 'seller'} response regarding vehicle history, mechanical condition, documentation, or inspections...`}
                      className="w-full p-2.5 sm:p-3 text-xs sm:text-sm border border-amber-300/90 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white text-zinc-900 placeholder-zinc-400"
                    />

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-amber-800 italic">
                        Responses will appear nested directly beneath this question with your verified badge.
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setInlineReplyTargetId(null)}
                          className="px-3 py-1.5 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={submittingInlineReply || !inlineReplyText.trim()}
                          className="px-4 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{submittingInlineReply ? 'Submitting...' : 'Post Official Response'}</span>
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* Nested Official Responses (Indented directly under question) */}
                {nestedReplies.length > 0 && (
                  <div className="mt-3.5 ml-3 sm:ml-6 pl-3 sm:pl-4 border-l-2 border-amber-400/80 space-y-2.5">
                    {nestedReplies.map((reply) => {
                      const isReplySeller = reply.userBadge === 'Seller' || reply.userName.toLowerCase().includes('seller');
                      const isReplyAdmin = reply.userBadge === 'Admin';
                      const isReplyUpvoted = user ? reply.upvotedBy?.includes(user.uid) : false;
                      const canModerateReply = Boolean(isAdmin || (user && user.uid === reply.userId));
                      const isReplyEditing = editingCommentId === reply.id;
                      const isReplyConfirmingDelete = confirmDeleteId === reply.id;

                      return (
                        <div
                          key={reply.id}
                          className={`p-3.5 rounded-xl border transition-all ${
                            isReplyAdmin
                              ? 'bg-red-50/70 border-red-200 shadow-xs'
                              : isReplySeller
                                ? 'bg-amber-50/80 border-amber-200/90 shadow-xs'
                                : 'bg-zinc-50 border-zinc-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1.5 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <CornerDownRight className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                                <span className="font-bold text-xs sm:text-sm text-zinc-900 font-sans">
                                  {reply.userName}
                                </span>

                                {isReplySeller && (
                                  <span className="px-2 py-0.5 rounded bg-amber-600 text-white text-[10px] font-extrabold uppercase tracking-wide shadow-xs">
                                    Seller
                                  </span>
                                )}
                                {isReplyAdmin && (
                                  <span className="px-2 py-0.5 rounded bg-red-700 text-white text-[10px] font-bold uppercase tracking-wide">
                                    Admin
                                  </span>
                                )}
                                {!isReplySeller && !isReplyAdmin && (
                                  <span className="px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 text-[10px] font-semibold">
                                    {reply.userBadge || 'Member'}
                                  </span>
                                )}

                                <span className="text-[11px] text-zinc-400">
                                  {formatRelativeTime(reply.timestamp)}
                                </span>

                                {reply.isEdited && (
                                  <span className="text-[10px] text-zinc-400 italic">
                                    (edited)
                                  </span>
                                )}
                              </div>

                              {isReplyEditing ? (
                                <div className="mt-2 space-y-2 bg-white p-2.5 rounded-lg border border-zinc-300">
                                  <textarea
                                    rows={2}
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    className="w-full p-2 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-900"
                                  />
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={handleCancelEdit}
                                      className="px-2 py-1 text-xs text-zinc-600 hover:text-zinc-900"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveEdit(reply.id)}
                                      className="px-3 py-1 text-xs rounded bg-zinc-900 text-white font-bold"
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-zinc-800 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap pl-5 sm:pl-6">
                                  {reply.text}
                                </p>
                              )}
                            </div>

                            {/* Reply card controls */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => handleUpvote(reply.id)}
                                className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors border cursor-pointer ${
                                  isReplyUpvoted
                                    ? 'bg-red-50 border-red-200 text-red-700 font-bold'
                                    : 'bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-600'
                                }`}
                                title="Helpful"
                              >
                                <ThumbsUp className={`w-3 h-3 ${isReplyUpvoted ? 'fill-red-600 text-red-600' : ''}`} />
                                <span>{reply.upvotes || 0}</span>
                              </button>

                              {canModerateReply && !isReplyEditing && (
                                <div className="flex items-center gap-1 pl-1">
                                  <button
                                    onClick={() => handleStartEdit(reply)}
                                    className="p-1 rounded text-zinc-400 hover:text-zinc-800 hover:bg-white transition-colors"
                                    title="Edit Response"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  {isReplyConfirmingDelete ? (
                                    <div className="flex items-center gap-1 bg-red-50 p-1 rounded border border-red-200 text-[10px]">
                                      <button
                                        onClick={() => handleDelete(reply.id)}
                                        className="px-1.5 py-0.5 rounded bg-red-600 text-white font-bold"
                                      >
                                        Delete
                                      </button>
                                      <button
                                        onClick={() => setConfirmDeleteId(null)}
                                        className="px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700"
                                      >
                                        No
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setConfirmDeleteId(reply.id)}
                                      className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                      title="Delete Response"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Post Comment Input Form */}
      <div id="comment-form" className="p-4 sm:p-6 bg-zinc-50 border-t border-zinc-200">
        {user ? (
          <form onSubmit={handlePost} className="space-y-3">
            {error && (
              <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {replyToUser && (
              <div className="flex items-center justify-between text-xs text-zinc-600 bg-zinc-200/80 px-2.5 py-1 rounded">
                <span>Replying to <strong>@{replyToUser}</strong></span>
                <button
                  type="button"
                  onClick={() => setReplyToUser(null)}
                  className="text-zinc-500 hover:text-zinc-800 text-[11px]"
                >
                  Cancel Reply
                </button>
              </div>
            )}

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-zinc-900 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 mt-1">
                {(userProfile?.displayName || user.displayName || 'U').charAt(0).toUpperCase()}
              </div>

              <div className="flex-1">
                <textarea
                  rows={3}
                  required
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={
                    isEmailVerified
                      ? "Ask a question about the vehicle, maintenance history, or build details..."
                      : "Email verification required before commenting..."
                  }
                  disabled={!isEmailVerified || loading}
                  className="w-full p-3 text-xs sm:text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                />
                
                <div className="flex items-center justify-between mt-2">
                  <div className="text-[11px] text-zinc-500">
                    Posting as <strong className="text-zinc-800">{userProfile?.displayName || user.email}</strong>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !commentText.trim() || !isEmailVerified}
                    className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow transition-all ${
                      loading || !commentText.trim() || !isEmailVerified
                        ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed'
                        : 'bg-zinc-900 hover:bg-black text-white hover:scale-105 active:scale-95'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{loading ? 'Posting...' : 'Submit Question / Comment'}</span>
                  </button>
                </div>
              </div>
            </div>
          </form>
        ) : (
          <div className="text-center py-6 bg-white rounded-lg border border-zinc-200 p-4 space-y-2">
            <h4 className="text-sm font-bold text-zinc-900">
              Join the Public Q&A Discussion
            </h4>
            <p className="text-xs text-zinc-600 max-w-md mx-auto">
              Sign in or register with verified email to ask technical questions, request specific photos, or chat with the seller.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-5 py-2 rounded-lg bg-zinc-900 hover:bg-black text-white text-xs font-bold inline-flex items-center gap-1.5 shadow"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In / Register to Comment</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
