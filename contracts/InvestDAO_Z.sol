pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract UniversalFHEAdapter is ZamaEthereumConfig {
    
    struct Proposal {
        string title;
        euint32 encryptedVoteCount;
        uint256 publicValue1;
        uint256 publicValue2;
        string description;
        address creator;
        uint256 timestamp;
        uint32 decryptedVoteCount;
        bool isVerified;
    }
    
    mapping(string => Proposal) public proposals;
    string[] public proposalIds;
    
    event ProposalCreated(string indexed proposalId, address indexed creator);
    event DecryptionVerified(string indexed proposalId, uint32 decryptedVoteCount);
    
    constructor() ZamaEthereumConfig() {
    }
    
    function createProposal(
        string calldata proposalId,
        string calldata title,
        externalEuint32 encryptedVoteCount,
        bytes calldata inputProof,
        uint256 publicValue1,
        uint256 publicValue2,
        string calldata description
    ) external {
        require(bytes(proposals[proposalId].title).length == 0, "Proposal already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedVoteCount, inputProof)), "Invalid encrypted input");
        
        proposals[proposalId] = Proposal({
            title: title,
            encryptedVoteCount: FHE.fromExternal(encryptedVoteCount, inputProof),
            publicValue1: publicValue1,
            publicValue2: publicValue2,
            description: description,
            creator: msg.sender,
            timestamp: block.timestamp,
            decryptedVoteCount: 0,
            isVerified: false
        });
        
        FHE.allowThis(proposals[proposalId].encryptedVoteCount);
        FHE.makePubliclyDecryptable(proposals[proposalId].encryptedVoteCount);
        
        proposalIds.push(proposalId);
        emit ProposalCreated(proposalId, msg.sender);
    }
    
    function verifyDecryption(
        string calldata proposalId, 
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(bytes(proposals[proposalId].title).length > 0, "Proposal does not exist");
        require(!proposals[proposalId].isVerified, "Data already verified");
        
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(proposals[proposalId].encryptedVoteCount);
        
        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);
        
        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));
        
        proposals[proposalId].decryptedVoteCount = decodedValue;
        proposals[proposalId].isVerified = true;
        
        emit DecryptionVerified(proposalId, decodedValue);
    }
    
    function getEncryptedVoteCount(string calldata proposalId) external view returns (euint32) {
        require(bytes(proposals[proposalId].title).length > 0, "Proposal does not exist");
        return proposals[proposalId].encryptedVoteCount;
    }
    
    function getProposal(string calldata proposalId) external view returns (
        string memory title,
        uint256 publicValue1,
        uint256 publicValue2,
        string memory description,
        address creator,
        uint256 timestamp,
        bool isVerified,
        uint32 decryptedVoteCount
    ) {
        require(bytes(proposals[proposalId].title).length > 0, "Proposal does not exist");
        Proposal storage data = proposals[proposalId];
        
        return (
            data.title,
            data.publicValue1,
            data.publicValue2,
            data.description,
            data.creator,
            data.timestamp,
            data.isVerified,
            data.decryptedVoteCount
        );
    }
    
    function getAllProposalIds() external view returns (string[] memory) {
        return proposalIds;
    }
    
    function isAvailable() public pure returns (bool) {
        return true;
    }
}


