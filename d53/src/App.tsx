import React from 'react';
import VideoEncoder from './components/VideoEncoder';

const App: React.FC = () => {
    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
            <VideoEncoder />
        </div>
    );
};

export default App;
