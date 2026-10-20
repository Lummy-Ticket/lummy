// What works for real, and what is still a stand-in. A stand-in stays in the code for the sample
// personas and the demo, labelled as a sample, but an account never sees it as if it worked, and
// nothing that is not live is charged for (docs/04, "Status fitur"). Flip a flag only when the
// thing behind it is built, tested and, where it touches law, reviewed.
export const FEATURES = {
  /**
   * A certified e-signature (TTE) and e-stamp (e-meterai) on the letter of authorisation, through a
   * licensed provider (PSrE, docs/04 §4-5). Not contracted yet: the buyer gets a draft the seller
   * signs on a paper stamp, and no stamp fee is charged.
   */
  eStamp: false,
  /**
   * The seller's ID card, stored encrypted and shown to the buyer near the show with a watermark
   * (docs/02, gate KTP). Not built: the upload kept only a file name. Until it is, an account
   * cannot stage an ID card, and the buyer's page offers none.
   */
  sellerIdCard: false,
} as const;
