// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title ShipmentEscrow
/// @notice Holds a buyer's payment for one shipment until the shipment's release officer signs an EIP-712
///         authorization naming the exact payee, the full amount and the hash of the evidence file behind the
///         decision. Anyone may submit the authorization. Each shipment is released or refunded once.
contract ShipmentEscrow is EIP712 {
    using SafeERC20 for IERC20;

    enum State {
        None,
        Funded,
        Released,
        Refunded
    }

    struct Escrow {
        address buyer;
        IERC20 token;
        uint256 amount;
        address releaseOfficer;
        uint64 refundAfter;
        State state;
    }

    bytes32 public constant RELEASE_TYPEHASH =
        keccak256("Release(bytes32 shipmentId,address payee,uint256 amount,bytes32 evidenceHash,uint64 validUntil)");

    mapping(bytes32 shipmentId => Escrow) public escrows;

    event Funded(bytes32 indexed shipmentId, address indexed buyer, address token, uint256 amount, address releaseOfficer, uint64 refundAfter);
    event Released(bytes32 indexed shipmentId, address indexed payee, uint256 amount, bytes32 evidenceHash);
    event Refunded(bytes32 indexed shipmentId, address indexed buyer, uint256 amount);

    error AlreadyFunded();
    error InvalidEscrow();
    error NotFunded();
    error AuthorizationExpired();
    error NotReleaseOfficer();
    error NotBuyer();
    error RefundTooEarly();

    constructor() EIP712("Triad ShipmentEscrow", "1") {}

    /// @notice Locks `amount` of `token` from the caller for `shipmentId`.
    function fund(bytes32 shipmentId, IERC20 token, uint256 amount, address releaseOfficer, uint64 refundAfter) external {
        if (escrows[shipmentId].state != State.None) revert AlreadyFunded();
        if (amount == 0 || address(token) == address(0) || releaseOfficer == address(0) || refundAfter <= block.timestamp) revert InvalidEscrow();
        escrows[shipmentId] = Escrow({
            buyer: msg.sender, token: token, amount: amount, releaseOfficer: releaseOfficer, refundAfter: refundAfter, state: State.Funded
        });
        emit Funded(shipmentId, msg.sender, address(token), amount, releaseOfficer, refundAfter);
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Pays the full escrow to `payee` if the release officer signed exactly this payee, amount and evidence.
    function release(bytes32 shipmentId, address payee, bytes32 evidenceHash, uint64 validUntil, bytes calldata signature) external {
        Escrow storage e = escrows[shipmentId];
        if (e.state != State.Funded) revert NotFunded();
        if (block.timestamp > validUntil) revert AuthorizationExpired();
        if (ECDSA.recover(releaseDigest(shipmentId, payee, e.amount, evidenceHash, validUntil), signature) != e.releaseOfficer) revert NotReleaseOfficer();
        e.state = State.Released;
        emit Released(shipmentId, payee, e.amount, evidenceHash);
        e.token.safeTransfer(payee, e.amount);
    }

    /// @notice Returns the escrow to the buyer after `refundAfter` if it was never released.
    function refund(bytes32 shipmentId) external {
        Escrow storage e = escrows[shipmentId];
        if (e.state != State.Funded) revert NotFunded();
        if (msg.sender != e.buyer) revert NotBuyer();
        if (block.timestamp < e.refundAfter) revert RefundTooEarly();
        e.state = State.Refunded;
        emit Refunded(shipmentId, e.buyer, e.amount);
        e.token.safeTransfer(e.buyer, e.amount);
    }

    /// @notice The EIP-712 digest the release officer signs.
    function releaseDigest(bytes32 shipmentId, address payee, uint256 amount, bytes32 evidenceHash, uint64 validUntil) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(RELEASE_TYPEHASH, shipmentId, payee, amount, evidenceHash, validUntil)));
    }
}
