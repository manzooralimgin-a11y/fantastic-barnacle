"use client";

import { useState, useEffect } from "react";
import { Plus, Euro, Mail, QrCode, Send, Eye, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import * as Dialog from "@/components/ui/dialog";
import api from "@/lib/api";



export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  
  // Form State
  const [amountTotal, setAmountTotal] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  // Modal State
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [resending, setResending] = useState<number | null>(null);


  const fetchVouchers = async () => {
    try {
      setLoading(true);
      const res = await api.get("/vouchers");
      setVouchers(res.data);
    } catch (e) {
      console.error("Failed to fetch vouchers:", e);
      toast.error("Database connection failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVouchers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    
    try {
      const payload = {
        amount_total: parseFloat(amountTotal),
        customer_name: customerName || null,
        customer_email: customerEmail || null,
        notes: notes || null,
        expiry_date: expiryDate ? new Date(expiryDate).toISOString() : null
      };

      await api.post("/vouchers", payload);
      
      toast.success(customerEmail ? "Voucher Generated & Email Sent Securely!" : "Voucher Created! (No email assigned)");
      
      // Reset Form
      setAmountTotal("");
      setCustomerName("");
      setCustomerEmail("");
      setNotes("");
      setExpiryDate("");
      
      fetchVouchers();
    } catch (e) {
      toast.error("Failed to generate voucher.");
    } finally {
      setCreating(false);
    }
  };

  const handleResendEmail = async (voucherId: number) => {
    try {
      setResending(voucherId);
      await api.post(`/vouchers/${voucherId}/resend-email`);
      toast.success("Email resend triggered successfully");
    } catch (e) {
      toast.error("Failed to resend email");
    } finally {
      setResending(null);
    }
  };

  const handleOpenQR = (voucher: any) => {
    setSelectedVoucher(voucher);
    setShowQRModal(true);
  };


  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge className="bg-emerald-500">Active</Badge>;
      case "used": return <Badge variant="secondary">Redeemed</Badge>;
      case "expired": return <Badge variant="destructive">Expired</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Voucher Management</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        
        {/* Create Voucher Form */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Create Digital Voucher</CardTitle>
            <CardDescription>Issue a new gift card. Will be emailed automatically if provided.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (€) *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="1"
                  autoComplete="off"
                  required
                  value={amountTotal}
                  onChange={(e) => setAmountTotal(e.target.value)}
                  placeholder="50.00"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Customer Name</Label>
                  <Input
                    id="name"
                    value={customerName}
                    autoComplete="off"
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Customer Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="off"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="john@example.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiry">Expiry Date (Optional)</Label>
                <Input
                  id="expiry"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Internal Notes</Label>
                <Input
                  id="notes"
                  value={notes}
                  autoComplete="off"
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Birthday Gift"
                />
              </div>

              <Button type="submit" disabled={creating} className="w-full">
                {creating ? "Generating..." : "Generate Voucher & QR Code"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Vouchers Ledger List */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Issued Vouchers</CardTitle>
            <CardDescription>Recent gift cards and remaining balances</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground w-full text-center py-10">Loading DB...</p>
            ) : vouchers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <QrCode className="h-10 w-10 text-muted-foreground mb-4 opacity-50" />
                <p className="text-sm text-muted-foreground">No vouchers generated yet.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Issued</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vouchers.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs">{v.code}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{v.customer_name || 'Anonymous'}</span>
                          {v.customer_email && <span className="text-xs text-muted-foreground">{v.customer_email}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">€{v.amount_remaining}</span>
                          <span className="text-xs text-muted-foreground">/ €{v.amount_total}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(v.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleOpenQR(v)} title="View QR">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {v.customer_email && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleResendEmail(v.id)}
                              disabled={resending === v.id}
                              title="Resend Email"
                            >
                              <Send className={`h-4 w-4 ${resending === v.id ? 'animate-pulse' : ''}`} />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* QR Code Modal */}
      <Dialog.Dialog open={showQRModal} onOpenChange={setShowQRModal}>
        <Dialog.DialogContent className="sm:max-w-md">
          <Dialog.DialogHeader>
            <Dialog.DialogTitle>Voucher QR Code</Dialog.DialogTitle>
            <Dialog.DialogDescription>
              {selectedVoucher?.code} - €{selectedVoucher?.amount_remaining}
            </Dialog.DialogDescription>
          </Dialog.DialogHeader>
          <div className="flex flex-col items-center justify-center p-6 bg-card rounded-xl">
             {selectedVoucher?.qr_code_base64 ? (
               <img 
                 src={selectedVoucher.qr_code_base64} 
                 alt="QR Code" 
                 className="w-64 h-64"
               />
             ) : (
               <div className="w-64 h-64 flex items-center justify-center border-2 border-dashed rounded-lg text-muted-foreground">
                 Loading QR...
               </div>
             )}
             <p className="mt-4 font-mono text-lg font-bold tracking-widest">{selectedVoucher?.code}</p>
          </div>
          <Dialog.DialogFooter className="sm:justify-between">
            <Button variant="outline" onClick={() => setShowQRModal(false)}>Close</Button>
            <Button 
              className="gap-2"
              onClick={() => {
                const link = document.createElement('a');
                link.href = selectedVoucher.qr_code_base64;
                link.download = `Voucher-${selectedVoucher.code}.png`;
                link.click();
              }}
            >
              <Download className="h-4 w-4" /> Download PNG
            </Button>
          </Dialog.DialogFooter>
        </Dialog.DialogContent>
      </Dialog.Dialog>

    </div>

  );
}
