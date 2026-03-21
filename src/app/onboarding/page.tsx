"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

type OnboardingPath = "youtube" | "upload" | null;

export default function OnboardingPage() {
  const router = useRouter();
  const [path, setPath] = useState<OnboardingPath>(null);
  const [creatorName, setCreatorName] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleYouTube = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setProgress(10);
    setStatus("Analyzing YouTube video...");

    try {
      const res = await fetch("/api/onboarding/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl, creatorName }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setProgress(100);
      setStatus("Your editing DNA is ready!");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError("");
    setProgress(10);
    setStatus("Analyzing your video...");

    try {
      const formData = new FormData();
      formData.append("video", file);
      formData.append("creatorName", creatorName);

      const res = await fetch("/api/onboarding/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setProgress(100);
      setStatus("Your editing DNA is ready!");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-2xl">Your Editing DNA is Ready</CardTitle>
            <CardDescription>Your AI editor now knows your style</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/dashboard")} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Set Up Your Editing Style</CardTitle>
          <CardDescription>How do you want to create your editing DNA?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!path && (
            <div className="grid grid-cols-1 gap-4">
              <Button
                variant="outline"
                className="h-24 text-left flex flex-col items-start p-4"
                onClick={() => setPath("youtube")}
              >
                <span className="font-semibold">Paste YouTube URL</span>
                <span className="text-sm text-muted-foreground">
                  Analyze a creator's editing style from their YouTube video
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-24 text-left flex flex-col items-start p-4"
                onClick={() => setPath("upload")}
              >
                <span className="font-semibold">Upload Your Video</span>
                <span className="text-sm text-muted-foreground">
                  Analyze your own edited video to extract your style
                </span>
              </Button>
            </div>
          )}

          {path && !loading && (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setPath(null)}>
                Back
              </Button>
              <div className="space-y-2">
                <Label>Creator / Style Name</Label>
                <Input
                  placeholder="e.g., My Vlog Style"
                  value={creatorName}
                  onChange={(e) => setCreatorName(e.target.value)}
                  required
                />
              </div>

              {path === "youtube" && (
                <form onSubmit={handleYouTube} className="space-y-4">
                  <div className="space-y-2">
                    <Label>YouTube URL</Label>
                    <Input
                      placeholder="https://youtube.com/watch?v=..."
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={!creatorName}>
                    Analyze Style
                  </Button>
                </form>
              )}

              {path === "upload" && (
                <form onSubmit={handleUpload} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Your Edited Video</Label>
                    <Input
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={!creatorName || !file}>
                    Analyze Style
                  </Button>
                </form>
              )}
            </div>
          )}

          {loading && (
            <div className="space-y-4">
              <Progress value={progress} />
              <p className="text-sm text-center text-muted-foreground">{status}</p>
            </div>
          )}

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
