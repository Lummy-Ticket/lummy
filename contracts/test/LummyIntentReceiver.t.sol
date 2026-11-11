// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {LummyEscrow} from "../src/LummyEscrow.sol";
import {IntentOrder, LummyIntentFactory, LummyIntentReceiver} from "../src/LummyIntentReceiver.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {EscrowBase} from "./utils/EscrowBase.sol";

/// @notice The money's two exits, in every order they can come in. "Pays" stands for NEAR Intents
/// delivering USDC to the receiver's address, which is a plain token transfer.
contract LummyIntentReceiverTest is EscrowBase {
    bytes32 internal constant ID = keccak256("hold-1");
    bytes32 internal constant COMMIT = keccak256("barcode-1");

    LummyIntentFactory internal factory;
    address internal refundTo = makeAddr("refundTo");

    function setUp() public override {
        super.setUp();
        factory = new LummyIntentFactory(escrow);
    }

    function _order() internal view returns (IntentOrder memory) {
        return IntentOrder({
            listingId: ID,
            seller: seller,
            // forge-lint: disable-next-line(unsafe-typecast)
            price: uint128(PRICE),
            eventEndsAt: _now40() + 7 days,
            refundTo: refundTo,
            refundAfter: _now40() + 1 hours
        });
    }

    function _listAsAgreed(IntentOrder memory o) internal {
        vm.prank(operator);
        escrow.createListingFor(o.seller, o.listingId, o.price, COMMIT, o.eventEndsAt);
    }

    function _pay(IntentOrder memory o, uint256 amount) internal returns (address at) {
        at = factory.receiverOf(o);
        usdc.mint(at, amount);
    }

    function _funded() internal returns (IntentOrder memory o, LummyIntentReceiver r) {
        o = _order();
        _listAsAgreed(o);
        _pay(o, PRICE);
        r = factory.deployAndFund(o);
    }

    // ================================================================
    // The address
    // ================================================================

    function test_address_isKnownBeforeAnythingExists_andMatchesTheDeploy() public {
        IntentOrder memory o = _order();
        address at = factory.receiverOf(o);
        assertEq(at.code.length, 0);
        LummyIntentReceiver r = factory.deploy(o);
        assertEq(address(r), at);
        assertEq(r.REFUND_TO(), refundTo);
        assertEq(r.SELLER(), seller);
        assertEq(r.PRICE(), PRICE);
    }

    function test_address_changesWithEveryTerm() public view {
        IntentOrder memory o = _order();
        address at = factory.receiverOf(o);
        IntentOrder memory x = _order();
        x.seller = stranger;
        assertTrue(factory.receiverOf(x) != at, "seller");
        x = _order();
        x.price = o.price + 1;
        assertTrue(factory.receiverOf(x) != at, "price");
        x = _order();
        x.refundTo = stranger;
        assertTrue(factory.receiverOf(x) != at, "refund");
        x = _order();
        x.eventEndsAt = o.eventEndsAt + 1;
        assertTrue(factory.receiverOf(x) != at, "end");
        x = _order();
        x.refundAfter = o.refundAfter + 1;
        assertTrue(factory.receiverOf(x) != at, "after");
        x = _order();
        x.listingId = keccak256("hold-2");
        assertTrue(factory.receiverOf(x) != at, "listing");
    }

    function test_deploy_isIdempotent() public {
        IntentOrder memory o = _order();
        LummyIntentReceiver a = factory.deploy(o);
        LummyIntentReceiver b = factory.deploy(o);
        assertEq(address(a), address(b));
    }

    function test_constructor_refusesZeroAddresses() public {
        IntentOrder memory o = _order();
        o.refundTo = address(0);
        vm.expectRevert(LummyIntentReceiver.ZeroAddress.selector);
        factory.deploy(o);
        o = _order();
        o.seller = address(0);
        vm.expectRevert(LummyIntentReceiver.ZeroAddress.selector);
        factory.deploy(o);
    }

    // ================================================================
    // Into the escrow
    // ================================================================

    function test_fund_locksTheMoney_receiverIsTheBuyer() public {
        (, LummyIntentReceiver r) = _funded();
        _assertStatus(ID, LummyEscrow.Status.Funded);
        assertEq(_listing(ID).buyer, address(r));
        assertEq(usdc.balanceOf(address(escrow)), PRICE);
        assertEq(usdc.balanceOf(address(r)), 0);
    }

    function test_fund_isOpenToAnyone() public {
        IntentOrder memory o = _order();
        _listAsAgreed(o);
        _pay(o, PRICE);
        LummyIntentReceiver r = factory.deploy(o);
        vm.prank(stranger);
        r.fund();
        _assertStatus(ID, LummyEscrow.Status.Funded);
    }

    function test_fund_overpayment_goesBackAtOnce() public {
        IntentOrder memory o = _order();
        _listAsAgreed(o);
        _pay(o, PRICE + 7e6);
        factory.deployAndFund(o);
        assertEq(usdc.balanceOf(address(escrow)), PRICE);
        assertEq(usdc.balanceOf(refundTo), 7e6);
    }

    function test_fund_underpayment_waits_thenCompletes() public {
        IntentOrder memory o = _order();
        _listAsAgreed(o);
        address at = _pay(o, PRICE - 1);
        vm.expectRevert(abi.encodeWithSelector(LummyIntentReceiver.NotPaid.selector, PRICE - 1, PRICE));
        factory.deployAndFund(o);
        usdc.mint(at, 1);
        factory.deployAndFund(o);
        _assertStatus(ID, LummyEscrow.Status.Funded);
    }

    function test_fund_refusesAListingThatDoesNotExist() public {
        IntentOrder memory o = _order();
        _pay(o, PRICE);
        vm.expectRevert(abi.encodeWithSelector(LummyIntentReceiver.NotListed.selector, LummyEscrow.Status.None));
        factory.deployAndFund(o);
    }

    function test_fund_refusesAnotherSeller() public {
        IntentOrder memory o = _order();
        _pay(o, PRICE);
        vm.prank(operator);
        escrow.createListingFor(stranger, ID, PRICE, COMMIT, o.eventEndsAt);
        vm.expectRevert(LummyIntentReceiver.TermsChanged.selector);
        factory.deployAndFund(o);
    }

    function test_fund_refusesAnotherPrice() public {
        IntentOrder memory o = _order();
        _pay(o, PRICE);
        vm.prank(operator);
        escrow.createListingFor(seller, ID, PRICE - 1, COMMIT, o.eventEndsAt);
        vm.expectRevert(LummyIntentReceiver.TermsChanged.selector);
        factory.deployAndFund(o);
    }

    function test_fund_refusesAnEarlierShowEnd() public {
        IntentOrder memory o = _order();
        _pay(o, PRICE);
        vm.prank(operator);
        escrow.createListingFor(seller, ID, PRICE, COMMIT, o.eventEndsAt - 1);
        vm.expectRevert(LummyIntentReceiver.TermsChanged.selector);
        factory.deployAndFund(o);
    }

    function test_fund_acceptsALaterShowEnd() public {
        IntentOrder memory o = _order();
        _pay(o, PRICE);
        vm.prank(operator);
        escrow.createListingFor(seller, ID, PRICE, COMMIT, o.eventEndsAt + 1 days);
        factory.deployAndFund(o);
        _assertStatus(ID, LummyEscrow.Status.Funded);
    }

    function test_fund_refusedFromRefundAfter() public {
        IntentOrder memory o = _order();
        _listAsAgreed(o);
        _pay(o, PRICE);
        vm.warp(o.refundAfter);
        vm.expectRevert(LummyIntentReceiver.TooLate.selector);
        factory.deployAndFund(o);
    }

    function test_fund_twice_isRefused() public {
        (IntentOrder memory o, LummyIntentReceiver r) = _funded();
        _pay(o, PRICE);
        vm.expectRevert(abi.encodeWithSelector(LummyIntentReceiver.NotListed.selector, LummyEscrow.Status.Funded));
        r.fund();
    }

    // ================================================================
    // Back to the buyer
    // ================================================================

    function test_sweep_waitsWhileTheListingCanStillBeFunded() public {
        IntentOrder memory o = _order();
        _listAsAgreed(o);
        _pay(o, PRICE);
        LummyIntentReceiver r = factory.deploy(o);
        vm.prank(stranger);
        vm.expectRevert(LummyIntentReceiver.TooEarly.selector);
        r.sweep();
    }

    function test_sweep_waitsWhileTheListingDoesNotExistYet() public {
        IntentOrder memory o = _order();
        _pay(o, PRICE);
        LummyIntentReceiver r = factory.deploy(o);
        vm.expectRevert(LummyIntentReceiver.TooEarly.selector);
        r.sweep();
    }

    /// The backend is gone: no listing was ever made. The buyer still gets the money back, with no key.
    function test_sweep_afterRefundAfter_needsNoBackend() public {
        IntentOrder memory o = _order();
        _pay(o, PRICE);
        vm.warp(o.refundAfter);
        LummyIntentReceiver r = factory.deploy(o);
        vm.prank(stranger);
        r.sweep();
        assertEq(usdc.balanceOf(refundTo), PRICE);
    }

    function test_sweep_cancelledListing_goesBackAtOnce() public {
        IntentOrder memory o = _order();
        _listAsAgreed(o);
        _pay(o, PRICE);
        vm.prank(operator);
        escrow.cancelListing(ID);
        factory.deploy(o).sweep();
        assertEq(usdc.balanceOf(refundTo), PRICE);
    }

    /// Somebody else bought that listing first: this payment goes back at once.
    function test_sweep_listingFundedBySomeoneElse_goesBackAtOnce() public {
        IntentOrder memory o = _order();
        _listAsAgreed(o);
        _pay(o, PRICE);
        _fund(ID, PRICE);
        factory.deploy(o).sweep();
        assertEq(usdc.balanceOf(refundTo), PRICE);
        assertEq(_listing(ID).buyer, buyer);
    }

    function test_sweep_secondPaymentAfterFunding_goesBack() public {
        (IntentOrder memory o, LummyIntentReceiver r) = _funded();
        _pay(o, 3e6);
        r.sweep();
        assertEq(usdc.balanceOf(refundTo), 3e6);
        _assertStatus(ID, LummyEscrow.Status.Funded);
    }

    function test_sweep_withNothing_isRefused() public {
        (, LummyIntentReceiver r) = _funded();
        vm.expectRevert(LummyIntentReceiver.NothingToSweep.selector);
        r.sweep();
    }

    function test_refund_reachesTheRefundAddress() public {
        (, LummyIntentReceiver r) = _funded();
        vm.prank(operator);
        escrow.refund(ID);
        assertEq(escrow.pending(address(r)), PRICE);
        vm.prank(stranger);
        r.sweep();
        assertEq(usdc.balanceOf(refundTo), PRICE);
        assertEq(escrow.pending(address(r)), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    // ================================================================
    // Claims and the seller
    // ================================================================

    function test_dispute_buyerOpensItFromTheRefundAddress() public {
        (, LummyIntentReceiver r) = _funded();
        vm.prank(refundTo);
        r.raiseDispute();
        assertTrue(_listing(ID).disputed);
    }

    function test_dispute_nobodyElseCanOpenIt() public {
        (, LummyIntentReceiver r) = _funded();
        vm.prank(stranger);
        vm.expectRevert(LummyIntentReceiver.NotBuyer.selector);
        r.raiseDispute();
    }

    function test_dispute_operatorActsForTheBuyer_asForAnyOther() public {
        _funded();
        vm.prank(operator);
        escrow.raiseDispute(ID);
        assertTrue(_listing(ID).disputed);
    }

    function testFuzz_ruling_splitsBetweenRefundAddressAndSeller(uint256 toBuyer) public {
        toBuyer = bound(toBuyer, 0, PRICE);
        (, LummyIntentReceiver r) = _funded();
        vm.prank(refundTo);
        r.raiseDispute();
        vm.prank(operator);
        escrow.resolveDispute(ID, toBuyer);

        if (toBuyer != 0) r.sweep();
        if (toBuyer != PRICE) escrow.withdrawFor(seller);
        assertEq(usdc.balanceOf(refundTo), toBuyer);
        assertEq(usdc.balanceOf(seller), PRICE - toBuyer);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(usdc.balanceOf(address(r)), 0);
    }

    function test_release_paysTheSellerAfterTheWindow() public {
        (IntentOrder memory o,) = _funded();
        vm.prank(operator);
        escrow.markHandover(ID, HANDOVER);
        vm.warp(uint256(o.eventEndsAt) + WINDOW + 1);
        vm.prank(stranger);
        escrow.release(ID);
        escrow.withdrawFor(seller);
        assertEq(usdc.balanceOf(seller), PRICE);
    }

    // ================================================================
    // Nobody else gets in
    // ================================================================

    function test_signature_isRefusedOutsideFund() public {
        (, LummyIntentReceiver r) = _funded();
        vm.prank(address(escrow));
        assertEq(r.isValidSignature(bytes32(0), ""), bytes4(0xffffffff));
        vm.prank(address(usdc));
        assertEq(r.isValidSignature(bytes32(0), ""), bytes4(0xffffffff));
        assertTrue(r.isValidSignature(bytes32(0), "") != IERC1271.isValidSignature.selector);
    }

    /// A stranger tries to take the waiting money with an empty ERC-3009 authorisation to themselves.
    function test_token_cannotBePulledWithAnEmptySignature() public {
        IntentOrder memory o = _order();
        address at = _pay(o, PRICE);
        factory.deploy(o);
        vm.prank(stranger);
        vm.expectRevert(MockUSDC.InvalidSignature.selector);
        usdc.receiveWithAuthorization(at, stranger, PRICE, 0, type(uint256).max, keccak256("x"), "");
        assertEq(usdc.balanceOf(at), PRICE);
    }

    /// The same, before the receiver has any code: an address with no code cannot sign at all.
    function test_token_cannotBePulledBeforeDeploy() public {
        IntentOrder memory o = _order();
        address at = _pay(o, PRICE);
        vm.prank(stranger);
        vm.expectRevert(MockUSDC.InvalidSignature.selector);
        usdc.receiveWithAuthorization(at, stranger, PRICE, 0, type(uint256).max, keccak256("x"), "");
    }

    /// A leaked operator key: it can refuse or refund, but the money only ever reaches the two parties.
    function testFuzz_leakedOperator_neverReachesAThirdParty(address attacker, uint256 toBuyer) public {
        vm.assume(attacker != refundTo && attacker != seller && attacker != address(escrow) && attacker != address(0));
        toBuyer = bound(toBuyer, 0, PRICE);
        // What it holds already is its own: the fuzzer can pick an account this suite funds in setUp
        // (it picked `buyer`, with 10,000 USDC, in CI on 11 Nov 2026). The claim is that it gains nothing.
        uint256 held = usdc.balanceOf(attacker);
        (, LummyIntentReceiver r) = _funded();
        vm.startPrank(operator);
        escrow.raiseDispute(ID);
        escrow.resolveDispute(ID, toBuyer);
        vm.stopPrank();
        if (toBuyer != 0) r.sweep();
        if (toBuyer != PRICE) escrow.withdrawFor(seller);
        assertEq(usdc.balanceOf(attacker), held);
        assertEq(usdc.balanceOf(refundTo) + usdc.balanceOf(seller), PRICE);
    }

    function testFuzz_overpayment_allAccountedFor(uint256 extra) public {
        extra = bound(extra, 0, 1_000_000e6);
        IntentOrder memory o = _order();
        _listAsAgreed(o);
        _pay(o, PRICE + extra);
        LummyIntentReceiver r = factory.deployAndFund(o);
        assertEq(usdc.balanceOf(address(escrow)), PRICE);
        assertEq(usdc.balanceOf(refundTo), extra);
        assertEq(usdc.balanceOf(address(r)), 0);
    }
}
