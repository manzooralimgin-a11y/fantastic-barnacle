import { EmailTemplate } from '@/components/email-template';
import { Resend } from 'resend';
import { NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder_key_for_build');

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customerEmail, customerName, amountTotal, voucherCode, qrCodeBase64, expiryDate, notes } = body;

    if (!customerEmail) {
      return NextResponse.json({ error: 'Customer email is required' }, { status: 400 });
    }

    const { data, error } = await resend.emails.send({
      from: 'DAS ELB <onboarding@resend.dev>',
      to: [customerEmail],
      subject: 'Dein DAS ELB Gutschein \uD83C\uDF81',
      react: EmailTemplate({ 
        customerName: customerName || '', 
        amountTotal: Number(amountTotal).toFixed(2), 
        voucherCode, 
        qrCodeBase64,
        expiryDate, 
        notes 
      }) as React.ReactElement,
    });

    if (error) {
      console.error("Resend API Error:", error);
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to send email:", error);
    return NextResponse.json({ error }, { status: 500 });
  }
}
