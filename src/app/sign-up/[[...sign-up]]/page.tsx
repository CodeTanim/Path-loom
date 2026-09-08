import { SignUp } from "@clerk/nextjs";

import { AccountPage } from "../../../features/account/AccountPage";
import { safeReturnPath } from "../../../features/account/return-path";
import { serviceConfiguration } from "../../../lib/server/config";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ returnBackUrl?: string | string[] }>;
}) {
  const enabled = serviceConfiguration().auth;
  const returnPath = safeReturnPath((await searchParams).returnBackUrl);

  return (
    <AccountPage enabled={enabled} returnPath={returnPath}>
      {enabled && (
        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl={`/sign-in?returnBackUrl=${encodeURIComponent(returnPath)}`}
          forceRedirectUrl={returnPath}
        />
      )}
    </AccountPage>
  );
}
