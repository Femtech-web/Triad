// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ShipmentEscrow} from "../src/ShipmentEscrow.sol";

contract TestUsdc is ERC20 {
    constructor() ERC20("Test USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract ShipmentEscrowTest is Test {
    ShipmentEscrow escrow;
    TestUsdc usdc;
    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address attacker = makeAddr("attacker");
    uint256 officerKey = 0xA11CE;
    address officer;
    bytes32 constant SHIPMENT = keccak256("shp-cu-0001");
    bytes32 constant EVIDENCE = keccak256("evidence file");
    uint256 constant AMOUNT = 25_000e6;

    function setUp() public {
        escrow = new ShipmentEscrow();
        usdc = new TestUsdc();
        officer = vm.addr(officerKey);
        usdc.mint(buyer, AMOUNT);
        vm.startPrank(buyer);
        usdc.approve(address(escrow), AMOUNT);
        escrow.fund(SHIPMENT, IERC20(address(usdc)), AMOUNT, officer, uint64(block.timestamp + 30 days));
        vm.stopPrank();
    }

    function sign(uint256 key, address payee, uint256 amount, bytes32 evidence, uint64 validUntil) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, escrow.releaseDigest(SHIPMENT, payee, amount, evidence, validUntil));
        return abi.encodePacked(r, s, v);
    }

    function test_releasePaysTheSignedPayeeOnce() public {
        uint64 validUntil = uint64(block.timestamp + 1 hours);
        bytes memory signature = sign(officerKey, seller, AMOUNT, EVIDENCE, validUntil);
        vm.expectEmit(true, true, false, true);
        emit ShipmentEscrow.Released(SHIPMENT, seller, AMOUNT, EVIDENCE);
        vm.prank(attacker); // anyone may relay a valid authorization; only the signed payee is paid
        escrow.release(SHIPMENT, seller, EVIDENCE, validUntil, signature);
        assertEq(usdc.balanceOf(seller), AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        vm.expectRevert(ShipmentEscrow.NotFunded.selector);
        escrow.release(SHIPMENT, seller, EVIDENCE, validUntil, signature);
    }

    function test_rejectsAnyChangeToTheAuthorization() public {
        uint64 validUntil = uint64(block.timestamp + 1 hours);
        bytes memory signature = sign(officerKey, seller, AMOUNT, EVIDENCE, validUntil);
        // Signatures are built first: building one calls the escrow, and expectRevert applies to the next call.
        bytes memory otherSigner = sign(0xB0B, seller, AMOUNT, EVIDENCE, validUntil);
        bytes memory partialAmount = sign(officerKey, seller, AMOUNT - 1, EVIDENCE, validUntil);
        vm.expectRevert(ShipmentEscrow.NotReleaseOfficer.selector);
        escrow.release(SHIPMENT, attacker, EVIDENCE, validUntil, signature);
        vm.expectRevert(ShipmentEscrow.NotReleaseOfficer.selector);
        escrow.release(SHIPMENT, seller, keccak256("different evidence"), validUntil, signature);
        vm.expectRevert(ShipmentEscrow.NotReleaseOfficer.selector);
        escrow.release(SHIPMENT, seller, EVIDENCE, validUntil + 1, signature);
        vm.expectRevert(ShipmentEscrow.NotReleaseOfficer.selector);
        escrow.release(SHIPMENT, seller, EVIDENCE, validUntil, otherSigner);
        vm.expectRevert(ShipmentEscrow.NotReleaseOfficer.selector);
        escrow.release(SHIPMENT, seller, EVIDENCE, validUntil, partialAmount);
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);
    }

    function test_expiredAuthorizationIsRefused() public {
        uint64 validUntil = uint64(block.timestamp + 1 hours);
        bytes memory signature = sign(officerKey, seller, AMOUNT, EVIDENCE, validUntil);
        vm.warp(validUntil + 1);
        vm.expectRevert(ShipmentEscrow.AuthorizationExpired.selector);
        escrow.release(SHIPMENT, seller, EVIDENCE, validUntil, signature);
    }

    function test_refundOnlyByTheBuyerAfterTheDeadline() public {
        vm.prank(buyer);
        vm.expectRevert(ShipmentEscrow.RefundTooEarly.selector);
        escrow.refund(SHIPMENT);
        vm.warp(block.timestamp + 30 days);
        vm.prank(attacker);
        vm.expectRevert(ShipmentEscrow.NotBuyer.selector);
        escrow.refund(SHIPMENT);
        vm.prank(buyer);
        escrow.refund(SHIPMENT);
        assertEq(usdc.balanceOf(buyer), AMOUNT);
        uint64 validUntil = uint64(block.timestamp + 1 hours);
        bytes memory late = sign(officerKey, seller, AMOUNT, EVIDENCE, validUntil);
        vm.expectRevert(ShipmentEscrow.NotFunded.selector);
        escrow.release(SHIPMENT, seller, EVIDENCE, validUntil, late);
    }

    function test_fundingIsValidatedAndOncePerShipment() public {
        vm.startPrank(buyer);
        vm.expectRevert(ShipmentEscrow.AlreadyFunded.selector);
        escrow.fund(SHIPMENT, IERC20(address(usdc)), 1, officer, uint64(block.timestamp + 1 days));
        vm.expectRevert(ShipmentEscrow.InvalidEscrow.selector);
        escrow.fund(keccak256("other"), IERC20(address(usdc)), 0, officer, uint64(block.timestamp + 1 days));
        vm.expectRevert(ShipmentEscrow.InvalidEscrow.selector);
        escrow.fund(keccak256("other"), IERC20(address(usdc)), 1, address(0), uint64(block.timestamp + 1 days));
        vm.expectRevert(ShipmentEscrow.InvalidEscrow.selector);
        escrow.fund(keccak256("other"), IERC20(address(usdc)), 1, officer, uint64(block.timestamp));
        vm.stopPrank();
    }

    function testFuzz_onlyTheSignedPayeeCanBePaid(address payee) public {
        vm.assume(payee != seller);
        uint64 validUntil = uint64(block.timestamp + 1 hours);
        bytes memory signature = sign(officerKey, seller, AMOUNT, EVIDENCE, validUntil);
        vm.expectRevert(ShipmentEscrow.NotReleaseOfficer.selector);
        escrow.release(SHIPMENT, payee, EVIDENCE, validUntil, signature);
    }

    function test_digestMatchesTheTypeScriptEncoder() public {
        // Pinned in packages/settle/test/vectors.test.ts: viem signs exactly the digest this contract checks.
        address at = 0xE5C0000000000000000000000000000000000001;
        vm.chainId(11155111);
        deployCodeTo("ShipmentEscrow.sol:ShipmentEscrow", at);
        bytes32 digest = ShipmentEscrow(at).releaseDigest(
            0xea342a6c9f584e993feca5f6797b9e198c6d6bb89ec54b736046614130be2134,
            0x1111111111111111111111111111111111111111,
            25_000_000_000,
            0x7f83957f16dea1bb5b15c002f408ef5c4317a04bcaf1c126e1129c9174dea93d,
            1_795_400_000
        );
        assertEq(digest, 0x7d609ed551df407d2c80265952d21018f8231a82e341384dd7c1a0494b4cbed3);
    }
}
