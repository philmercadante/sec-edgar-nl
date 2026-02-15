import { describe, it, expect } from 'vitest';
import { parseForm4Xml } from '../src/processing/insider-processor.js';

const SAMPLE_FORM4_SALE = `<?xml version="1.0"?>
<ownershipDocument>
  <issuer>
    <issuerCik>0000320193</issuerCik>
    <issuerName>Apple Inc</issuerName>
    <issuerTradingSymbol>AAPL</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0001214156</rptOwnerCik>
      <rptOwnerName>COOK TIMOTHY D</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>1</isDirector>
      <isOfficer>1</isOfficer>
      <officerTitle>Chief Executive Officer</officerTitle>
      <isTenPercentOwner>0</isTenPercentOwner>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <transactionDate><value>2025-10-15</value></transactionDate>
      <transactionCoding>
        <transactionCode>S</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>100000</value></transactionShares>
        <transactionPricePerShare><value>175.50</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>3276941</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

const SAMPLE_FORM4_PURCHASE = `<?xml version="1.0"?>
<ownershipDocument>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0001234567</rptOwnerCik>
      <rptOwnerName>DOE JOHN A</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>0</isDirector>
      <isOfficer>1</isOfficer>
      <officerTitle>CFO</officerTitle>
      <isTenPercentOwner>0</isTenPercentOwner>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <transactionDate><value>2025-11-01</value></transactionDate>
      <transactionCoding>
        <transactionCode>P</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>5000</value></transactionShares>
        <transactionPricePerShare><value>150.25</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>25000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

const SAMPLE_FORM4_MULTI = `<?xml version="1.0"?>
<ownershipDocument>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0009999999</rptOwnerCik>
      <rptOwnerName>SMITH JANE</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>1</isDirector>
      <isOfficer>0</isOfficer>
      <isTenPercentOwner>0</isTenPercentOwner>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <transactionDate><value>2025-12-01</value></transactionDate>
      <transactionCoding>
        <transactionCode>M</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>10000</value></transactionShares>
        <transactionPricePerShare><value>50.00</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>110000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <transactionDate><value>2025-12-01</value></transactionDate>
      <transactionCoding>
        <transactionCode>S</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>5000</value></transactionShares>
        <transactionPricePerShare><value>200.00</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>105000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

const SAMPLE_NO_TRANSACTIONS = `<?xml version="1.0"?>
<ownershipDocument>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0001111111</rptOwnerCik>
      <rptOwnerName>NOBODY HERE</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>1</isDirector>
      <isOfficer>0</isOfficer>
    </reportingOwnerRelationship>
  </reportingOwner>
</ownershipDocument>`;

describe('parseForm4Xml', () => {
  it('parses a sale transaction', () => {
    const txns = parseForm4Xml(SAMPLE_FORM4_SALE, '0001-23-456789', '2025-10-16');
    expect(txns).toHaveLength(1);

    const txn = txns[0];
    expect(txn.insider.name).toBe('Timothy D Cook');
    expect(txn.insider.is_director).toBe(true);
    expect(txn.insider.is_officer).toBe(true);
    expect(txn.insider.officer_title).toBe('Chief Executive Officer');
    expect(txn.transaction_date).toBe('2025-10-15');
    expect(txn.transaction_code).toBe('S');
    expect(txn.transaction_type).toBe('disposition');
    expect(txn.shares).toBe(100000);
    expect(txn.price_per_share).toBe(175.50);
    expect(txn.total_value).toBe(17550000);
    expect(txn.shares_owned_after).toBe(3276941);
    expect(txn.filing_accession).toBe('0001-23-456789');
    expect(txn.filing_date).toBe('2025-10-16');
  });

  it('parses a purchase transaction', () => {
    const txns = parseForm4Xml(SAMPLE_FORM4_PURCHASE, '0002-23-456789', '2025-11-02');
    expect(txns).toHaveLength(1);

    const txn = txns[0];
    expect(txn.insider.name).toBe('John A Doe');
    expect(txn.insider.is_officer).toBe(true);
    expect(txn.insider.officer_title).toBe('CFO');
    expect(txn.transaction_code).toBe('P');
    expect(txn.transaction_type).toBe('acquisition');
    expect(txn.shares).toBe(5000);
    expect(txn.price_per_share).toBe(150.25);
    expect(txn.total_value).toBe(751250);
    expect(txn.shares_owned_after).toBe(25000);
  });

  it('parses multiple transactions from one filing', () => {
    const txns = parseForm4Xml(SAMPLE_FORM4_MULTI, '0003-23-456789', '2025-12-02');
    expect(txns).toHaveLength(2);

    // Exercise (M)
    expect(txns[0].transaction_code).toBe('M');
    expect(txns[0].shares).toBe(10000);
    expect(txns[0].transaction_type).toBe('acquisition');

    // Sale (S)
    expect(txns[1].transaction_code).toBe('S');
    expect(txns[1].shares).toBe(5000);
    expect(txns[1].price_per_share).toBe(200.00);
    expect(txns[1].transaction_type).toBe('disposition');
  });

  it('handles filing with no transaction table', () => {
    const txns = parseForm4Xml(SAMPLE_NO_TRANSACTIONS, '0004-23-456789', '2025-12-01');
    expect(txns).toHaveLength(0);
  });

  it('handles empty/malformed XML', () => {
    const txns = parseForm4Xml('not xml at all', '0005-23-456789', '2025-12-01');
    expect(txns).toHaveLength(0);
  });

  it('formats ALL CAPS names correctly', () => {
    const txns = parseForm4Xml(SAMPLE_FORM4_SALE, '0001-23-456789', '2025-10-16');
    expect(txns[0].insider.name).toBe('Timothy D Cook');
  });

  it('handles director without officer title', () => {
    const txns = parseForm4Xml(SAMPLE_FORM4_MULTI, '0003-23-456789', '2025-12-02');
    expect(txns[0].insider.is_director).toBe(true);
    expect(txns[0].insider.is_officer).toBe(false);
    expect(txns[0].insider.officer_title).toBe('');
  });

  it('handles all-zeros CIK gracefully', () => {
    const xml = `<?xml version="1.0"?>
<ownershipDocument>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0000000000</rptOwnerCik>
      <rptOwnerName>ZERO CIK PERSON</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>1</isDirector>
      <isOfficer>0</isOfficer>
      <isTenPercentOwner>0</isTenPercentOwner>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <transactionDate><value>2025-12-01</value></transactionDate>
      <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>1000</value></transactionShares>
        <transactionPricePerShare><value>10.00</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>1000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;
    const txns = parseForm4Xml(xml, '0006-23-456789', '2025-12-02');
    expect(txns).toHaveLength(1);
    expect(txns[0].insider.cik).toBe('0'); // Should not be empty string
  });

  it('parses nested value tags with whitespace correctly', () => {
    // Tests the extractNestedValue regex with multiline content
    const xml = `<?xml version="1.0"?>
<ownershipDocument>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0001234567</rptOwnerCik>
      <rptOwnerName>WHITESPACE TEST</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>1</isDirector>
      <isOfficer>0</isOfficer>
      <isTenPercentOwner>0</isTenPercentOwner>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <transactionDate><value>2025-12-01</value></transactionDate>
      <transactionCoding><transactionCode>S</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares>
          <value>2500</value>
        </transactionShares>
        <transactionPricePerShare>
          <value>99.99</value>
        </transactionPricePerShare>
        <transactionAcquiredDisposedCode>
          <value>D</value>
        </transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction>
          <value>7500</value>
        </sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;
    const txns = parseForm4Xml(xml, '0007-23-456789', '2025-12-02');
    expect(txns).toHaveLength(1);
    expect(txns[0].shares).toBe(2500);
    expect(txns[0].price_per_share).toBe(99.99);
    expect(txns[0].shares_owned_after).toBe(7500);
  });
});
