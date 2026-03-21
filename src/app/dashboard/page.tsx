"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { getAllPresets, type FilmmakerPreset } from "@/lib/presets/filmmaker-presets";

const CATEGORY_COLORS: Record<string, string> = {
  cinematic: "bg-red-900/30 border-red-700 text-red-300",
  social: "bg-blue-900/30 border-blue-700 text-blue-300",
  classic: "bg-amber-900/30 border-amber-700 text-amber-300",
};

export default function DashboardPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [platform, setPlatform] = useState("youtube");
  const [clipCount, setClipCount] = useState(5);
  const [dnaProfiles, setDnaProfiles] = useState<any[]>([]);
  const [selectedDna, setSelectedDna] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ step: "", pct: 0, status: "" });
  const [error, setError] = useState("");

  const presets = getAllPresets();

  useEffect(() => {
    loadDnaProfiles();
  }, []);

  const loadDnaProfiles = async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data } = await supabase
        .from("dna_profiles")
        .select("id, name, confidence, source_type")
        .eq("user_id", user.id);

      if (data && data.length > 0) {
        setDnaProfiles(data);
        setSelectedDna(data[0].id);
      } else {
        router.push("/onboarding");
      }
    } catch { /* ignore */ }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length || !selectedDna) return;
    setLoading(true);
    setError("");

    try {
      // Upload video files first
      const videoUrls: string[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("bucket", "raw-videos");

        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error);
        videoUrls.push(uploadData.localPath || uploadData.url);
      }

      // Create job
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrls,
          dnaProfileId: selectedDna,
          platform,
          clipCount,
          ...(selectedPreset ? { presetId: selectedPreset } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setJobId(data.jobId);

      // Start SSE progress stream
      const eventSource = new EventSource(`/api/jobs/${data.jobId}/progress`);
      eventSource.onmessage = (event) => {
        const prog = JSON.parse(event.data);
        setProgress(prog);
        if (prog.status === "completed") {
          eventSource.close();
          router.push(`/dashboard/results/${data.jobId}`);
        }
        if (prog.status === "failed") {
          eventSource.close();
          setError(prog.error || "Processing failed");
          setLoading(false);
        }
      };
      eventSource.onerror = () => {
        eventSource.close();
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Upload raw footage and create clips</p>
        </div>

        {loading && jobId ? (
          <Card>
            <CardHeader>
              <CardTitle>Processing Your Video</CardTitle>
              <CardDescription>Job ID: {jobId}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={progress.pct} />
              <p className="text-sm text-muted-foreground capitalize">
                {progress.step?.replace(/_/g, " ") || "Starting..."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Upload Raw Footage</CardTitle>
                <CardDescription>1-2 camera files, max 1 hour</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  required
                />
                {files.length > 0 && (
                  <div className="flex gap-2">
                    {files.map((f, i) => (
                      <Badge key={i} variant="secondary">{f.name}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Configure</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>DNA Profile</Label>
                  <select
                    className="w-full p-2 rounded border bg-background"
                    value={selectedDna}
                    onChange={(e) => setSelectedDna(e.target.value)}
                  >
                    {dnaProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.source_type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Filmmaker Preset</Label>
                  <select
                    className="w-full p-2 rounded border bg-background"
                    value={selectedPreset}
                    onChange={(e) => setSelectedPreset(e.target.value)}
                  >
                    <option value="">None (use DNA profile only)</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.category})
                      </option>
                    ))}
                  </select>
                  {selectedPreset && (
                    <p className="text-xs text-muted-foreground">
                      Preset overrides your DNA profile&apos;s style settings for this job.
                    </p>
                  )}
                </div>

                {/* Preset Cards Grid */}
                <div className="grid grid-cols-2 gap-2">
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setSelectedPreset(
                          selectedPreset === preset.id ? "" : preset.id
                        )
                      }
                      className={`text-left p-3 rounded-lg border transition-all ${
                        selectedPreset === preset.id
                          ? "ring-2 ring-white border-white"
                          : "border-gray-700 hover:border-gray-500"
                      } ${CATEGORY_COLORS[preset.category] || "bg-gray-900/30 border-gray-700 text-gray-300"}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm">{preset.name}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {preset.category}
                        </Badge>
                      </div>
                      <p className="text-[11px] opacity-80 line-clamp-2">
                        {preset.description}
                      </p>
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label>Platform</Label>
                  <select
                    className="w-full p-2 rounded border bg-background"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                  >
                    <option value="youtube">YouTube Shorts</option>
                    <option value="tiktok">TikTok</option>
                    <option value="reels">Instagram Reels</option>
                    <option value="shorts">Shorts</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Number of Clips</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={clipCount}
                    onChange={(e) => setClipCount(parseInt(e.target.value) || 5)}
                  />
                </div>
              </CardContent>
            </Card>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <Button type="submit" className="w-full" size="lg" disabled={!files.length || !selectedDna}>
              Start Processing
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
