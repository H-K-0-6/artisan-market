import { Suspense } from "react";
import { AuthForm } from "@/components/shop/auth-form";

export const metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <Suspense>
      <AuthForm mode="sign-up" />
    </Suspense>
  );
}
