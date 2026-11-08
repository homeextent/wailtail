/** Shared declaration wording; a submission affirms this exact version, not dealer verification. */
export const INTAKE_DECLARATION_VERSION = 'dealer-intake-v1';
export const CANADIAN_LICENSING_JURISDICTIONS = [
  ['AB', 'Alberta'], ['BC', 'British Columbia'], ['MB', 'Manitoba'], ['NB', 'New Brunswick'],
  ['NL', 'Newfoundland and Labrador'], ['NS', 'Nova Scotia'], ['NT', 'Northwest Territories'],
  ['NU', 'Nunavut'], ['ON', 'Ontario'], ['PE', 'Prince Edward Island'], ['QC', 'Quebec'],
  ['SK', 'Saskatchewan'], ['YT', 'Yukon']
] as const;
export const DEALER_DECLARATIONS = [
  ['dealershipOwnershipDeclaration', 'The dealership is the registered legal owner of this vehicle and holds clean title.'],
  ['legalSellerOfRecordDeclaration', 'The dealership will be the sole legal seller of record and is responsible for its retail sale obligations.'],
  ['noBrokeredInventoryDeclaration', 'This is not brokered inventory, a third-party consignment to the dealership, or a private-owner pass-through sale.']
] as const;
