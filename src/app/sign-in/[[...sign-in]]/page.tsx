import { SignIn } from "@clerk/nextjs";

import { AccountPage } from "../../../features/account/AccountPage";
import { safeReturnPath } from "../../../features/account/return-path";
import { serviceConfiguration } from "../../../lib/server/config";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnBackUrl?: string | string[] }>;
}) {
  const enabled = serviceConfiguration().auth;
  const returnPath = safeReturnPath((await searchParams).returnBackUrl);

  return (
    <AccountPage enabled={enabled} returnPath={returnPath}>
      {enabled && (
        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl={`/sign-up?returnBackUrl=${encodeURIComponent(returnPath)}`}
          forceRedirectUrl={returnPath}
        />
      )}
    </AccountPage>
  );
}
