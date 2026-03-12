import * as React from 'react';

interface VoucherEmailTemplateProps {
  customerName: string;
  amountTotal: string;
  voucherCode: string;
  qrCodeBase64?: string;
  expiryDate?: string;
  notes?: string;
}

export const EmailTemplate: React.FC<Readonly<VoucherEmailTemplateProps>> = ({
  customerName,
  amountTotal,
  voucherCode,
  qrCodeBase64,
  expiryDate,
  notes,
}) => (
  <div style={{ fontFamily: 'Arial, sans-serif', color: '#1e293b', lineHeight: '1.6', maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
    <div style={{ textAlign: 'center', marginBottom: '30px' }}>
      <h1 style={{ color: '#0f172a', letterSpacing: '2px', textTransform: 'uppercase' }}>DAS ELB</h1>
      <p style={{ fontSize: '18px', color: '#64748b' }}>Dein digitaler Gutschein</p>
    </div>

    <p>Hallo {customerName ? customerName : 'lieber Gast'},</p>
    <p>vielen Dank für deine Bestellung! Anbei erhältst du deinen digitalen Gutschein für tolle Momente im DAS ELB.</p>
    
    <div style={{ background: '#f8fafc', padding: '30px', borderRadius: '12px', margin: '30px 0', border: '1px solid #e2e8f0', textAlign: 'center' }}>
      <h2 style={{ margin: '0 0 15px 0', color: '#10b981', fontSize: '32px' }}>{amountTotal} €</h2>
      <div style={{ background: '#ffffff', padding: '15px', borderRadius: '8px', display: 'inline-block', border: '2px dashed #cbd5e1' }}>
        {qrCodeBase64 && (
          <img src={qrCodeBase64} alt="Gutschein QR Code" style={{ display: 'block', margin: '0 auto 15px auto', width: '150px', height: '150px' }} />
        )}
        <p style={{ margin: '0', fontSize: '24px', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '2px' }}>{voucherCode}</p>
      </div>
      {expiryDate && <p style={{ margin: '15px 0 0 0', color: '#64748b', fontSize: '14px' }}>Gültig bis: {new Date(expiryDate).toLocaleDateString('de-DE')}</p>}
    </div>

    {notes && (
      <div style={{ margin: '20px 0', padding: '15px', borderLeft: '4px solid #10b981', background: '#f0fdf4' }}>
        <p style={{ margin: '0', fontStyle: 'italic', color: '#166534' }}>{notes}</p>
      </div>
    )}

    <p>Zeige diesen Code bei deinem nächsten Besuch einfach bei unserem Personal vor oder scanne den QR-Code vor Ort, um den Betrag von deiner Rechnung abziehen zu lassen.</p>
    
    <p style={{ marginTop: '40px' }}>Wir freuen uns auf deinen Besuch!<br /><br />Herzliche Grüße,<br /><strong>Dein DAS ELB Team</strong></p>
  </div>
);
