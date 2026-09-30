import { Suspense } from "react";
import { AuthForm } from "@/components/shop/auth-form";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <Suspense>
      <AuthForm mode="sign-in" />
    </Suspense>
  );
}
