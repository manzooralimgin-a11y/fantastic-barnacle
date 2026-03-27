import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { tokens } from '../../design-system/tokens';

const SyncStatus = ({ isOnline, queueSize, isSyncing }) => {
    return (
        <div style={{
            position: 'fixed',
            bottom: '100px', // Above the dock
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: isOnline ? 'rgba(0,0,0,0.6)' : tokens.colors.status.danger,
            backdropFilter: 'blur(10px)',
            color: '#fff',
            padding: '6px 16px',
            borderRadius: tokens.borderRadius.large,
            fontSize: '0.75rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 40,
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
            transition: 'all 0.3s'
        }}>
            {isOnline ? (
                isSyncing ? (
                    <>
                        <RefreshCw size={14} style={{ animation: 'spin 1.5s linear infinite' }} />
                        <span>Syncing {queueSize} actions...</span>
                    </>
                ) : (
                    <>
                        <Cloud size={14} />
                        <span>Online</span>
                    </>
                )
            ) : (
                <>
                    <CloudOff size={14} />
                    <span>Offline ({queueSize} actions queued)</span>
                </>
            )}
            <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
};

export default SyncStatus;
