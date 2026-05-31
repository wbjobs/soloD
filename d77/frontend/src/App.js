import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import SubgraphPanel from './components/panels/SubgraphPanel';
import ShortestPathPanel from './components/panels/ShortestPathPanel';
import MutualFriendsPanel from './components/panels/MutualFriendsPanel';
import InfluencersPanel from './components/panels/InfluencersPanel';

function App() {
  const [activeTab, setActiveTab] = useState('subgraph');

  const renderPanel = () => {
    switch (activeTab) {
      case 'subgraph':
        return <SubgraphPanel />;
      case 'shortestPath':
        return <ShortestPathPanel />;
      case 'mutualFriends':
        return <MutualFriendsPanel />;
      case 'influencers':
        return <InfluencersPanel />;
      default:
        return <SubgraphPanel />;
    }
  };

  return (
    <div className="h-screen flex bg-gray-100">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 overflow-hidden">
        {renderPanel()}
      </main>
    </div>
  );
}

export default App;
