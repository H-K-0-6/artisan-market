import { generateUploadDropzone } from "@uploadthing/react";
import type { UploadRouter } from "@/server/uploadthing";

export const UploadDropzone = generateUploadDropzone<UploadRouter>();
