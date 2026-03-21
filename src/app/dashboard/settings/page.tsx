"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [dnaProfiles, setDnaProfiles] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    if (user) {
      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();
      setProfile(userData);

      const { data: dna } = await supabase
        .from("dna_profiles")
        .select("id, name, confidence, source_type, created_at")
        .eq("user_id", user.id);
      setDnaProfiles(dna || []);
    }
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Settings</h1>

        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p><span className="text-muted-foreground">Email:</span> {user?.email}</p>
            <p>
              <span className="text-muted-foreground">Plan:</span>{" "}
              <Badge>{profile?.plan_tier || "free"}</Badge>
            </p>
            <Separator />
            <Button variant="destructive" onClick={handleSignOut}>Sign Out</Button>
          </CardContent>
        </Card>

        {/* Credits */}
        <Card>
          <CardHeader>
            <CardTitle>Credits</CardTitle>
            <CardDescription>Your processing credits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-bold">{profile?.credits_remaining ?? 3} credits remaining</p>
            <p className="text-sm text-muted-foreground">
              Total used: {profile?.credits_used_total ?? 0}
            </p>
          </CardContent>
        </Card>

        {/* DNA Profiles */}
        <Card>
          <CardHeader>
            <CardTitle>DNA Profiles</CardTitle>
            <CardDescription>Your editing style profiles</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dnaProfiles.length === 0 ? (
              <p className="text-muted-foreground">No profiles yet</p>
            ) : (
              dnaProfiles.map((dna) => (
                <div key={dna.id} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <p className="font-medium">{dna.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {dna.source_type} — confidence: {(dna.confidence * 100).toFixed(0)}%
                    </p>
                  </div>
                  <Badge variant="outline">{dna.source_type}</Badge>
                </div>
              ))
            )}
            <Button variant="outline" onClick={() => window.location.href = "/onboarding"}>
              Create New Profile
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
