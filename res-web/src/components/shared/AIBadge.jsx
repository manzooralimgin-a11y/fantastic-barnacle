import React from 'react';
import { tokens } from '../../design-system/tokens';

const AIBadge = ({ label = "AI Suggestion" }) => {
    return (
        <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: tokens.borderRadius.medium,
            backgroundColor: tokens.colors.ai.glow,
            border: `1px solid ${tokens.colors.ai.border}`,
            color: tokens.colors.ai.text,
            fontSize: tokens.typography.small,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            boxShadow: tokens.shadows.ai
        }}>
            <span style={{
                width: '8px',
                height: '8px',
                borderRadius: tokens.borderRadius.round,
                backgroundColor: tokens.colors.ai.text,
                animation: 'pulse 2s infinite'
            }} />
            {label}
            <style>{`
        @keyframes pulse {
          0% { opacity: 0.4; }
          50% { opacity: 1; }
          100% { opacity: 0.4; }
        }
      `}</style>
        </div>
    );
};

export default AIBadge;
