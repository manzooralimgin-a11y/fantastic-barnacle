"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Building2, Bot, Bell, Key } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Manage your restaurant configuration</p>
      </div>

      <div className="space-y-6 max-w-3xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
                <Building2 className="h-5 w-5 text-brand-500" />
              </div>
              <div>
                <CardTitle className="text-base">Restaurant Information</CardTitle>
                <CardDescription>Basic details about your restaurant</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Restaurant Name</label>
                <Input placeholder="My Restaurant" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Phone</label>
                <Input placeholder="+1 (555) 000-0000" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Email</label>
                <Input placeholder="contact@restaurant.com" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Address</label>
                <Input placeholder="123 Main St" />
              </div>
            </div>
            <Button>Save Changes</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
                <Bot className="h-5 w-5 text-brand-500" />
              </div>
              <div>
                <CardTitle className="text-base">Agent Configuration</CardTitle>
                <CardDescription>Configure AI agent behavior and autonomy levels</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Default Autonomy Level</label>
                <Input placeholder="supervised" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Decision Threshold ($)</label>
                <Input placeholder="500" type="number" />
              </div>
            </div>
            <Button>Save Changes</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
                <Bell className="h-5 w-5 text-brand-500" />
              </div>
              <div>
                <CardTitle className="text-base">Notification Preferences</CardTitle>
                <CardDescription>Choose how and when you receive notifications</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {[
                { label: "Email Notifications", desc: "Receive alerts via email" },
                { label: "Push Notifications", desc: "Browser push notifications" },
                { label: "Critical Alerts Only", desc: "Only notify for critical severity" },
                { label: "Daily Summary", desc: "Receive a daily operations summary" },
              ].map((pref) => (
                <div
                  key={pref.label}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-4"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{pref.label}</p>
                    <p className="text-xs text-gray-500">{pref.desc}</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input type="checkbox" className="peer sr-only" />
                    <div className="h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-brand-500 peer-checked:after:translate-x-full" />
                  </label>
                </div>
              ))}
            </div>
            <Button>Save Preferences</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
                <Key className="h-5 w-5 text-brand-500" />
              </div>
              <div>
                <CardTitle className="text-base">API Keys</CardTitle>
                <CardDescription>Manage integration API keys</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {[
                { name: "POS Integration", key: "pos_****_****_7f3a" },
                { name: "Accounting Software", key: "acc_****_****_2b1c" },
                { name: "Vision Camera API", key: "vis_****_****_9d4e" },
              ].map((apiKey) => (
                <div
                  key={apiKey.name}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-4"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{apiKey.name}</p>
                    <p className="text-xs font-mono text-gray-400">{apiKey.key}</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Regenerate
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* VoiceBooker Integration Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                <svg
                  className="h-5 w-5 text-emerald-500"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div>
                <CardTitle className="text-base">VoiceBooker.de Integration</CardTitle>
                <CardDescription>Configure your AI phone assistant webhooks</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Webhook Receiver URL</label>
                <div className="flex gap-2">
                  <Input 
                    readOnly 
                    value="https://gestronomy-api.onrender.com/webhooks/voicebooker" 
                    className="bg-gray-50 font-mono text-xs" 
                  />
                  <Button variant="outline" onClick={() => navigator.clipboard.writeText("https://gestronomy-api.onrender.com/webhooks/voicebooker")}>
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-gray-500">Paste this URL into the VoiceBooker.de dashboard to automatically receive reservations.</p>
              </div>
              
              <div className="space-y-2 mt-4">
                <label className="text-sm font-medium text-gray-700">Webhook Secret Key (HMAC-SHA256)</label>
                <div className="flex gap-2">
                  <Input 
                    type="password" 
                    readOnly 
                    value="dev_secret_key" 
                    className="bg-gray-50 font-mono text-xs" 
                  />
                  <Button variant="outline" onClick={() => navigator.clipboard.writeText("dev_secret_key")}>
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-gray-500">This secret ensures incoming reservations are securely signed by VoiceBooker.</p>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                  <div>
                    <p className="text-sm font-medium text-emerald-900">Endpoint Active</p>
                    <p className="text-xs text-emerald-700">Ready to receive incoming calls</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                  View Logs
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
