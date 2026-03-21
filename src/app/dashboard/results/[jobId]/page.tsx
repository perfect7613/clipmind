"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { TimelineEditor } from "@/components/timeline";

interface Clip {
  id: string;
  title: string;
  durationS: number;
  mood: string;
  scores: Record<string, number>;
  renderUrl: string;
}

export default function ResultsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const [job, setJob] = useState<any>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedClipId, setExpandedClipId] = useState<string | null>(null);
  const [feedbackClipId, setFeedbackClipId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [pinTimestamp, setPinTimestamp] = useState<number | null>(null);

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) { setError("Failed to load job"); setLoading(false); return; }
      const data = await res.json();
      setJob(data);
      setClips(data.clips || []);
    } catch { setError("Failed to load job"); }
    setLoading(false);
  }, [jobId]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  // Poll while processing
  useEffect(() => {
    if (!job || job.status !== "processing") return;
    const interval = setInterval(fetchJob, 3000);
    return () => clearInterval(interval);
  }, [job, fetchJob]);

  const getVideoUrl = (clip: Clip) => `/api/clips/${clip.id}/video`;

  const submitFeedback = async () => {
    if (pinTimestamp === null || !newComment || !feedbackClipId) return;
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clipId: feedbackClipId, timestampS: pinTimestamp, comment: newComment }),
    }).catch(() => {});
    setNewComment("");
    setPinTimestamp(null);
  };

  // ── Loading / Error / Processing states ──
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-muted-foreground">Loading results...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="pt-6 text-center space-y-4">
            <p className="text-destructive">{error}</p>
            <Button onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (job?.status === "failed") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-[500px]">
          <CardHeader><CardTitle className="text-destructive">Processing Failed</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{job.errorMessage || "An unknown error occurred"}</p>
            <Button onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (job?.status === "processing" || job?.status === "pending") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-[400px]">
          <CardHeader><CardTitle>Processing Your Video</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Progress value={job.progressPct || 0} />
            <p className="text-sm text-center text-muted-foreground capitalize">
              {job.currentStep?.replace(/_/g, " ") || "Starting..."}
            </p>
            <p className="text-xs text-center text-muted-foreground">{job.progressPct || 0}% complete</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Results view ──
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Your Clips</h1>
            <p className="text-sm text-muted-foreground">
              {clips.length} clip{clips.length !== 1 ? "s" : ""} generated
              {job?.presetId && <span> &middot; Preset: {job.presetId}</span>}
            </p>
          </div>
          <div className="flex gap-2">
            {job?.highlightReelUrl && (
              <Button
                variant="default"
                onClick={() => window.open(`/api/jobs/${jobId}/highlight-reel`, "_blank")}
              >
                Download Highlight Reel
              </Button>
            )}
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Back
            </Button>
          </div>
        </div>

        {/* Clip Cards */}
        <div className="space-y-4">
          {clips.map((clip) => {
            const isExpanded = expandedClipId === clip.id;

            return (
              <Card key={clip.id} className="overflow-hidden">
                {/* Clip Header */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedClipId(isExpanded ? null : clip.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-1 h-10 rounded-full ${isExpanded ? "bg-primary" : "bg-muted"}`} />
                    <div>
                      <h3 className="font-medium">{clip.title}</h3>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">{clip.mood}</Badge>
                        <Badge variant="outline" className="text-xs">{Math.round(clip.durationS)}s</Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Score pills */}
                    {clip.scores && Object.entries(clip.scores).slice(0, 3).map(([key, value]) => (
                      <div key={key} className="text-xs text-muted-foreground">
                        <span className="capitalize">{key}</span>
                        <span className="ml-1 font-mono text-foreground">{String(value)}</span>
                      </div>
                    ))}

                    <Separator orientation="vertical" className="h-6 mx-2" />

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(getVideoUrl(clip), "_blank");
                      }}
                    >
                      Download
                    </Button>

                    <Button
                      variant={isExpanded ? "default" : "outline"}
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedClipId(isExpanded ? null : clip.id);
                      }}
                    >
                      {isExpanded ? "Close Editor" : "Edit Timeline"}
                    </Button>
                  </div>
                </div>

                {/* Expanded Timeline Editor */}
                {isExpanded && (
                  <CardContent className="border-t bg-muted/10 p-4 space-y-4">
                    <TimelineEditor
                      clipId={clip.id}
                      videoSrc={getVideoUrl(clip)}
                    />

                    <Separator />

                    {/* Feedback section */}
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Leave feedback on specific moments to improve future edits
                      </p>
                      <div className="flex gap-2 items-center">
                        <Input
                          type="number"
                          step={0.1}
                          min={0}
                          max={clip.durationS}
                          placeholder="Time (s)"
                          className="w-24"
                          value={pinTimestamp ?? ""}
                          onChange={(e) => {
                            setPinTimestamp(e.target.value ? parseFloat(e.target.value) : null);
                            setFeedbackClipId(clip.id);
                          }}
                        />
                        <Input
                          placeholder="What would you change?"
                          value={feedbackClipId === clip.id ? newComment : ""}
                          onChange={(e) => { setNewComment(e.target.value); setFeedbackClipId(clip.id); }}
                          onKeyDown={(e) => e.key === "Enter" && submitFeedback()}
                          className="flex-1"
                        />
                        <Button onClick={submitFeedback} size="sm" disabled={!newComment || pinTimestamp === null}>
                          Pin
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {clips.length === 0 && job?.status === "completed" && (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">No clips were generated. Try with a different video.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
