import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface InvestmentProposal {
  id: string;
  name: string;
  encryptedValue: number;
  publicValue1: number;
  publicValue2: number;
  description: string;
  creator: string;
  timestamp: number;
  isVerified: boolean;
  decryptedValue: number;
  category: string;
  status: string;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<InvestmentProposal[]>([]);
  const [filteredProposals, setFilteredProposals] = useState<InvestmentProposal[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingProposal, setCreatingProposal] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newProposalData, setNewProposalData] = useState({ 
    name: "", 
    amount: "", 
    description: "",
    category: "crypto"
  });
  const [selectedProposal, setSelectedProposal] = useState<InvestmentProposal | null>(null);
  const [userHistory, setUserHistory] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState([
    { id: 1, title: "系统升级完成", content: "FHE加密系统已升级至v2.0", timestamp: Date.now() - 3600000 },
    { id: 2, title: "新投资策略", content: "添加AI预测算法支持", timestamp: Date.now() - 86400000 },
    { id: 3, title: "安全提醒", content: "请定期验证加密数据", timestamp: Date.now() - 172800000 }
  ]);
  const [stats, setStats] = useState({
    totalProposals: 0,
    totalValue: 0,
    verifiedCount: 0,
    activeMembers: 0
  });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevm = async () => {
      if (isConnected && !isInitialized) {
        try {
          await initialize();
        } catch (error) {
          console.error('FHEVM初始化失败:', error);
        }
      }
    };
    initFhevm();
  }, [isConnected, isInitialized, initialize]);

  useEffect(() => {
    if (isConnected) {
      loadData();
    }
  }, [isConnected]);

  useEffect(() => {
    filterProposals();
  }, [proposals, searchTerm, categoryFilter, statusFilter]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setLoading(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      await contract.isAvailable();
      
      const businessIds = await contract.getAllBusinessIds();
      const proposalsList: InvestmentProposal[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          proposalsList.push({
            id: businessId,
            name: businessData.name,
            encryptedValue: 0,
            publicValue1: Number(businessData.publicValue1),
            publicValue2: Number(businessData.publicValue2),
            description: businessData.description,
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue),
            category: "crypto",
            status: "active"
          });
        } catch (e) {
          console.error('加载数据错误:', e);
        }
      }
      
      setProposals(proposalsList);
      updateStats(proposalsList);
      updateUserHistory();
    } catch (e) {
      console.error('加载失败:', e);
    } finally {
      setLoading(false);
    }
  };

  const filterProposals = () => {
    let filtered = proposals;
    
    if (searchTerm) {
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (categoryFilter !== "all") {
      filtered = filtered.filter(p => p.category === categoryFilter);
    }
    
    if (statusFilter !== "all") {
      filtered = filtered.filter(p => p.status === statusFilter);
    }
    
    setFilteredProposals(filtered);
  };

  const updateStats = (proposalList: InvestmentProposal[]) => {
    const totalProposals = proposalList.length;
    const verifiedCount = proposalList.filter(p => p.isVerified).length;
    const totalValue = proposalList.reduce((sum, p) => sum + p.publicValue1, 0);
    
    setStats({
      totalProposals,
      totalValue,
      verifiedCount,
      activeMembers: new Set(proposalList.map(p => p.creator)).size
    });
  };

  const updateUserHistory = () => {
    if (!address) return;
    
    const userActions = proposals
      .filter(p => p.creator.toLowerCase() === address.toLowerCase())
      .map(p => ({
        type: "created",
        proposal: p.name,
        timestamp: p.timestamp,
        amount: p.publicValue1
      }));
    
    setUserHistory(userActions);
  };

  const createProposal = async () => {
    if (!isConnected || !address) {
      showTransactionStatus("error", "请先连接钱包");
      return;
    }
    
    setCreatingProposal(true);
    showTransactionStatus("pending", "使用FHE加密创建提案...");
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("合约连接失败");
      
      const amountValue = parseInt(newProposalData.amount) || 0;
      const businessId = `proposal-${Date.now()}`;
      
      const encryptedResult = await encrypt(await contract.getAddress(), address, amountValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newProposalData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        amountValue,
        0,
        newProposalData.description
      );
      
      showTransactionStatus("pending", "等待交易确认...");
      await tx.wait();
      
      showTransactionStatus("success", "投资提案创建成功!");
      await loadData();
      setShowCreateModal(false);
      setNewProposalData({ name: "", amount: "", description: "", category: "crypto" });
    } catch (e: any) {
      const errorMsg = e.message?.includes("user rejected") ? "用户取消交易" : "创建失败";
      showTransactionStatus("error", errorMsg);
    } finally {
      setCreatingProposal(false);
    }
  };

  const decryptProposal = async (proposalId: string) => {
    if (!isConnected || !address) {
      showTransactionStatus("error", "请先连接钱包");
      return null;
    }
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const proposalData = await contractRead.getBusinessData(proposalId);
      if (proposalData.isVerified) {
        showTransactionStatus("success", "数据已链上验证");
        return Number(proposalData.decryptedValue);
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValue = await contractRead.getEncryptedValue(proposalId);
      
      const result = await verifyDecryption(
        [encryptedValue],
        await contractRead.getAddress(),
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(proposalId, abiEncodedClearValues, decryptionProof)
      );
      
      showTransactionStatus("pending", "链上验证解密...");
      const clearValue = result.decryptionResult.clearValues[encryptedValue];
      
      await loadData();
      showTransactionStatus("success", "数据解密验证成功!");
      
      return Number(clearValue);
    } catch (e: any) {
      showTransactionStatus("error", "解密失败: " + (e.message || "未知错误"));
      return null;
    }
  };

  const showTransactionStatus = (status: string, message: string) => {
    setTransactionStatus({ visible: true, status, message });
    setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
  };

  const renderStatsDashboard = () => {
    return (
      <div className="stats-dashboard">
        <div className="stat-card metal-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>总提案数</h3>
            <div className="stat-value">{stats.totalProposals}</div>
          </div>
        </div>
        
        <div className="stat-card metal-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <h3>总投资额</h3>
            <div className="stat-value">{stats.totalValue}</div>
          </div>
        </div>
        
        <div className="stat-card metal-card">
          <div className="stat-icon">🔐</div>
          <div className="stat-content">
            <h3>已验证数据</h3>
            <div className="stat-value">{stats.verifiedCount}</div>
          </div>
        </div>
        
        <div className="stat-card metal-card">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <h3>活跃成员</h3>
            <div className="stat-value">{stats.activeMembers}</div>
          </div>
        </div>
      </div>
    );
  };

  const renderCharts = () => {
    const verifiedData = proposals.filter(p => p.isVerified);
    const categories = [...new Set(proposals.map(p => p.category))];
    
    return (
      <div className="charts-section">
        <div className="chart-container metal-card">
          <h3>提案分布</h3>
          <div className="chart-content">
            {categories.map(category => {
              const count = proposals.filter(p => p.category === category).length;
              const percentage = proposals.length > 0 ? (count / proposals.length) * 100 : 0;
              return (
                <div key={category} className="chart-bar">
                  <div className="bar-label">{category}</div>
                  <div className="bar-track">
                    <div 
                      className="bar-fill" 
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                  <div className="bar-value">{count}</div>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="chart-container metal-card">
          <h3>加密状态</h3>
          <div className="pie-chart">
            <div className="pie-segment verified" style={{ transform: 'rotate(0deg)' }}>
              <span>已验证 {stats.verifiedCount}</span>
            </div>
            <div className="pie-segment encrypted" style={{ transform: `rotate(${stats.verifiedCount/proposals.length*360}deg)` }}>
              <span>加密中 {proposals.length - stats.verifiedCount}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container metal-theme">
        <header className="app-header">
          <div className="logo">
            <h1>🏛️ 投资DAO隐私池</h1>
            <p>FHE加密投资决策平台</p>
          </div>
          <ConnectButton />
        </header>
        
        <div className="connection-prompt">
          <div className="metal-card prompt-content">
            <h2>🔐 连接钱包进入加密投资池</h2>
            <p>使用FHE全同态加密技术保护您的投资策略</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="loading-screen">
        <div className="metal-spinner"></div>
        <p>初始化FHE加密系统...</p>
      </div>
    );
  }

  return (
    <div className="app-container metal-theme">
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <h1>🏛️ 投资DAO隐私池</h1>
            <span className="fhe-badge">FHE 🔐</span>
          </div>
          <nav className="main-nav">
            <button className="nav-btn active">投资提案</button>
            <button className="nav-btn">数据分析</button>
            <button className="nav-btn">成员管理</button>
          </nav>
        </div>
        
        <div className="header-right">
          <button 
            className="create-btn metal-btn"
            onClick={() => setShowCreateModal(true)}
          >
            + 新建提案
          </button>
          <ConnectButton />
        </div>
      </header>

      <div className="main-content">
        <div className="sidebar">
          <div className="sidebar-section metal-card">
            <h3>🔍 筛选条件</h3>
            <div className="filter-group">
              <input 
                type="text" 
                placeholder="搜索提案..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            <div className="filter-group">
              <label>投资类别</label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">全部</option>
                <option value="crypto">加密货币</option>
                <option value="defi">DeFi</option>
                <option value="nft">NFT</option>
              </select>
            </div>
            <div className="filter-group">
              <label>状态</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">全部</option>
                <option value="active">活跃</option>
                <option value="completed">已完成</option>
              </select>
            </div>
          </div>

          <div className="sidebar-section metal-card">
            <h3>📢 系统公告</h3>
            <div className="announcements-list">
              {announcements.map(announcement => (
                <div key={announcement.id} className="announcement-item">
                  <strong>{announcement.title}</strong>
                  <p>{announcement.content}</p>
                  <span>{new Date(announcement.timestamp).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="sidebar-section metal-card">
            <h3>📋 操作记录</h3>
            <div className="history-list">
              {userHistory.slice(0, 5).map((action, index) => (
                <div key={index} className="history-item">
                  <span className="action-type">{action.type === "created" ? "创建" : "操作"}</span>
                  <span className="action-desc">{action.proposal}</span>
                </div>
              ))}
              {userHistory.length === 0 && <p>暂无操作记录</p>}
            </div>
          </div>
        </div>

        <div className="content-area">
          {renderStatsDashboard()}
          {renderCharts()}
          
          <div className="proposals-section">
            <div className="section-header">
              <h2>💼 投资提案列表</h2>
              <div className="section-actions">
                <button onClick={loadData} className="metal-btn secondary">刷新</button>
              </div>
            </div>
            
            <div className="proposals-grid">
              {filteredProposals.map(proposal => (
                <div 
                  key={proposal.id} 
                  className="proposal-card metal-card"
                  onClick={() => setSelectedProposal(proposal)}
                >
                  <div className="proposal-header">
                    <h3>{proposal.name}</h3>
                    <span className={`status-badge ${proposal.isVerified ? 'verified' : 'encrypted'}`}>
                      {proposal.isVerified ? '✅ 已验证' : '🔐 加密中'}
                    </span>
                  </div>
                  
                  <p className="proposal-desc">{proposal.description}</p>
                  
                  <div className="proposal-meta">
                    <span>金额: {proposal.publicValue1}</span>
                    <span>创建者: {proposal.creator.slice(0, 6)}...{proposal.creator.slice(-4)}</span>
                  </div>
                  
                  <div className="proposal-actions">
                    <button 
                      className={`metal-btn small ${proposal.isVerified ? 'verified' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        decryptProposal(proposal.id);
                      }}
                    >
                      {proposal.isVerified ? '查看详情' : '验证解密'}
                    </button>
                  </div>
                </div>
              ))}
              
              {filteredProposals.length === 0 && (
                <div className="empty-state metal-card">
                  <p>暂无投资提案</p>
                  <button 
                    className="metal-btn"
                    onClick={() => setShowCreateModal(true)}
                  >
                    创建第一个提案
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content metal-card">
            <div className="modal-header">
              <h2>📄 创建投资提案</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">×</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>提案名称</label>
                <input 
                  type="text" 
                  value={newProposalData.name}
                  onChange={(e) => setNewProposalData({...newProposalData, name: e.target.value})}
                  placeholder="输入提案名称..."
                />
              </div>
              
              <div className="form-group">
                <label>投资金额 (FHE加密)</label>
                <input 
                  type="number" 
                  value={newProposalData.amount}
                  onChange={(e) => setNewProposalData({...newProposalData, amount: e.target.value})}
                  placeholder="输入投资金额..."
                />
                <small>金额将通过FHE技术加密存储</small>
              </div>
              
              <div className="form-group">
                <label>描述</label>
                <textarea 
                  value={newProposalData.description}
                  onChange={(e) => setNewProposalData({...newProposalData, description: e.target.value})}
                  placeholder="描述投资策略..."
                  rows={3}
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                onClick={() => setShowCreateModal(false)} 
                className="metal-btn secondary"
              >
                取消
              </button>
              <button 
                onClick={createProposal} 
                disabled={creatingProposal || isEncrypting}
                className="metal-btn primary"
              >
                {creatingProposal || isEncrypting ? '加密创建中...' : '创建提案'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedProposal && (
        <div className="modal-overlay">
          <div className="modal-content metal-card large">
            <div className="modal-header">
              <h2>📋 提案详情</h2>
              <button onClick={() => setSelectedProposal(null)} className="close-btn">×</button>
            </div>
            
            <div className="modal-body">
              <div className="proposal-detail">
                <div className="detail-row">
                  <label>提案名称:</label>
                  <span>{selectedProposal.name}</span>
                </div>
                <div className="detail-row">
                  <label>投资金额:</label>
                  <span>
                    {selectedProposal.isVerified ? 
                      `${selectedProposal.decryptedValue} (已验证)` : 
                      '🔐 加密中'
                    }
                  </span>
                </div>
                <div className="detail-row">
                  <label>描述:</label>
                  <span>{selectedProposal.description}</span>
                </div>
                <div className="detail-row">
                  <label>创建者:</label>
                  <span>{selectedProposal.creator}</span>
                </div>
                <div className="detail-row">
                  <label>创建时间:</label>
                  <span>{new Date(selectedProposal.timestamp * 1000).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className={`transaction-toast ${transactionStatus.status}`}>
          <div className="toast-content">
            <span className="toast-icon">
              {transactionStatus.status === 'pending' ? '⏳' : 
               transactionStatus.status === 'success' ? '✅' : '❌'}
            </span>
            {transactionStatus.message}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;


