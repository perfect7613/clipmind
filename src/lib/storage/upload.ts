import { createClient } from "@/lib/supabase/server";

/**
 * Upload a file to Supabase Storage.
 * Returns the public URL of the uploaded file.
 */
export async function uploadToStorage(
  bucket: string,
  filePath: string,
  fileBuffer: Buffer,
  contentType: string = "video/mp4"
): Promise<string> {
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, fileBuffer, { contentType, upsert: true });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

/**
 * Get a signed URL for temporary access to a private file.
 */
export async function getSignedUrl(
  bucket: string,
  filePath: string,
  expiresIn: number = 3600
): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(`Signed URL failed: ${error?.message || "No URL returned"}`);
  }

  return data.signedUrl;
}

/**
 * Delete a file from Supabase Storage.
 */
export async function deleteFromStorage(
  bucket: string,
  filePath: string
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from(bucket)
    .remove([filePath]);

  if (error) {
    console.error(`Storage delete failed: ${error.message}`);
  }
}
