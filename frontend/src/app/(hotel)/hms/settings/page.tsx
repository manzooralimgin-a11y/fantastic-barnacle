"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Bed, Plug, Bell, Save } from "lucide-react";
import {
  defaultHotelPropertyId,
  fetchHotelRoomTypes,
  type HotelRoomTypeOption,
} from "@/lib/hotel-room-types";

export default function SettingsPage() {
  const [hotelName, setHotelName] = useState("DAS Elb Magdeburg");
  const [address, setAddress] = useState("Seilerweg 19, 39114 Magdeburg");
  const [phone, setPhone] = useState("+49 391 555 0000");
  const [email, setEmail] = useState("info@das-elb.de");
  const [checkIn, setCheckIn] = useState("15:00");
  const [checkOut, setCheckOut] = useState("11:00");
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [smsNotifs, setSmsNotifs] = useState(false);
  const [roomTypes, setRoomTypes] = useState<HotelRoomTypeOption[]>([]);

  useEffect(() => {
    fetchHotelRoomTypes(defaultHotelPropertyId)
      .then(setRoomTypes)
      .catch((error) => {
        console.error("Failed to load hotel room configuration", error);
      });
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div><h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">Settings</h1><p className="text-foreground-muted mt-1">Hotel configuration and system preferences</p></div>
        <button className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 self-start"><Save className="w-4 h-4" /> Save Changes</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5 flex flex-row items-center gap-3">
            <Building2 className="w-5 h-5 text-primary" /><CardTitle className="text-lg font-editorial text-foreground">Hotel Profile</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div><label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">Hotel Name</label><input value={hotelName} onChange={e => setHotelName(e.target.value)} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" /></div>
            <div><label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">Address</label><input value={address} onChange={e => setAddress(e.target.value)} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" /></div>
              <div><label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">Email</label><input value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">Check-in Time</label><input type="time" value={checkIn} onChange={e => setCheckIn(e.target.value)} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" /></div>
              <div><label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">Check-out Time</label><input type="time" value={checkOut} onChange={e => setCheckOut(e.target.value)} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5 flex flex-row items-center gap-3">
            <Bed className="w-5 h-5 text-primary" /><CardTitle className="text-lg font-editorial text-foreground">Room Configuration</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            {roomTypes.map((roomType) => (
              <div key={roomType.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm text-foreground">
                  {roomType.name} - {roomType.room_count || 0} rooms
                </span>
                <button className="text-xs font-medium text-primary hover:underline">Edit</button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5 flex flex-row items-center gap-3">
            <Plug className="w-5 h-5 text-primary" /><CardTitle className="text-lg font-editorial text-foreground">Integrations</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            {[{ name: "PMS - Gestronomy Core", status: "Connected" }, { name: "Channel Manager - SiteMinder", status: "Connected" }, { name: "Payment Gateway - Stripe", status: "Connected" }, { name: "Accounting - DATEV", status: "Not Connected" }].map(i => (
              <div key={i.name} className="flex items-center justify-between p-3 bg-muted rounded-lg"><span className="text-sm text-foreground">{i.name}</span><span className={`text-xs font-medium ${i.status === "Connected" ? "text-emerald-600" : "text-foreground-muted"}`}>{i.status}</span></div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5 flex flex-row items-center gap-3">
            <Bell className="w-5 h-5 text-primary" /><CardTitle className="text-lg font-editorial text-foreground">Notifications</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-foreground">Email Notifications</p><p className="text-xs text-foreground-muted">Booking confirmations, alerts, reports</p></div>
              <button onClick={() => setEmailNotifs(!emailNotifs)} className={`w-12 h-6 rounded-full transition-colors ${emailNotifs ? "bg-primary" : "bg-muted"} relative`}><div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${emailNotifs ? "translate-x-6" : "translate-x-0.5"}`} /></button>
            </div>
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-foreground">SMS Notifications</p><p className="text-xs text-foreground-muted">Critical alerts only</p></div>
              <button onClick={() => setSmsNotifs(!smsNotifs)} className={`w-12 h-6 rounded-full transition-colors ${smsNotifs ? "bg-primary" : "bg-muted"} relative`}><div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${smsNotifs ? "translate-x-6" : "translate-x-0.5"}`} /></button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
