import {
  CircleAlert,
  CircleCheck,
  CreditCard,
  LoaderCircle,
  LockKeyhole,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";

export type ScreenPreviewVariant =
  | "checkout"
  | "loading"
  | "success"
  | "error"
  | "retry"
  | "login"
  | "orders";

export type ScreenPreviewProps = {
  variant: ScreenPreviewVariant;
  compact?: boolean;
};

const previewNames: Record<ScreenPreviewVariant, string> = {
  checkout: "Checkout screen preview",
  loading: "Payment loading state preview",
  success: "Payment success state preview",
  error: "Payment error state preview",
  retry: "Payment retry state preview",
  login: "Sign in screen preview",
  orders: "Order history screen preview",
};

function PreviewChrome() {
  return (
    <div className="flex items-center justify-between border-b border-[#eceae4] px-2.5 py-1.5">
      <div className="flex items-center gap-1" aria-hidden="true">
        <span className="size-1.5 rounded-full bg-[#ee6f4d]" />
        <span className="size-1.5 rounded-full bg-[#e5b95c]" />
        <span className="size-1.5 rounded-full bg-[#5aaa91]" />
      </div>
      <div className="h-1.5 w-14 rounded-full bg-[#e7e5df]" />
      <div className="size-2.5 rounded-full bg-[#d8d5cc]" />
    </div>
  );
}

function CheckoutPreview({ compact }: { compact: boolean }) {
  return (
    <div className={`grid h-full grid-cols-[1.3fr_0.7fr] ${compact ? "gap-2 p-2" : "gap-3 p-3"}`}>
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center gap-1.5">
          <CreditCard className="size-2.5 text-[#6657d9]" strokeWidth={2.25} />
          <span className="text-[7px] font-bold text-[#282a2e]">Payment</span>
        </div>
        <div className="mb-1 h-2.5 rounded-[3px] border border-[#dedbd3] bg-[#fbfaf6]" />
        <div className="grid grid-cols-2 gap-1">
          <div className="h-2.5 rounded-[3px] border border-[#dedbd3] bg-[#fbfaf6]" />
          <div className="h-2.5 rounded-[3px] border border-[#dedbd3] bg-[#fbfaf6]" />
        </div>
        <div className="mt-1.5 h-3 rounded-[3px] bg-[#191b1f]" />
      </div>
      <div className="rounded-[5px] bg-[#f4f2ec] p-1.5">
        <div className="mb-1.5 h-1.5 w-8 rounded-full bg-[#c9c6bd]" />
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="h-1 w-6 rounded-full bg-[#d8d5cc]" />
            <span className="h-1 w-3 rounded-full bg-[#bbb8af]" />
          </div>
          <div className="flex justify-between">
            <span className="h-1 w-7 rounded-full bg-[#d8d5cc]" />
            <span className="h-1 w-4 rounded-full bg-[#bbb8af]" />
          </div>
        </div>
        <div className="mt-1.5 border-t border-[#dedbd3] pt-1">
          <div className="h-1 w-full rounded-full bg-[#ee6f4d]/70" />
        </div>
      </div>
    </div>
  );
}

function LoadingPreview({ compact }: { compact: boolean }) {
  return (
    <div className="relative grid h-full place-items-center bg-[#f8f7f2]">
      <div className="absolute inset-x-3 top-3 space-y-1.5 opacity-35">
        <div className="h-2 w-12 rounded-full bg-[#aaa69e]" />
        <div className="h-4 rounded-[4px] border border-[#cbc8c0] bg-white" />
        <div className="h-4 rounded-[4px] bg-[#25272b]" />
      </div>
      <div className={`relative flex flex-col items-center rounded-lg border border-[#e1ded7] bg-white shadow-sm ${compact ? "gap-1 p-2" : "gap-1.5 px-4 py-3"}`}>
        <LoaderCircle
          className="size-4 animate-spin text-[#6657d9] motion-reduce:animate-none"
          strokeWidth={2.4}
        />
        <span className="whitespace-nowrap text-[6.5px] font-semibold text-[#34363a]">
          Processing payment
        </span>
      </div>
    </div>
  );
}

function StatusPreview({
  compact,
  tone,
}: {
  compact: boolean;
  tone: "success" | "error" | "retry";
}) {
  const status = {
    success: {
      icon: CircleCheck,
      iconClass: "bg-[#e5f4ef] text-[#267968]",
      title: "Payment complete",
      detail: "Your order is confirmed.",
      button: "View order",
      buttonClass: "bg-[#267968]",
    },
    error: {
      icon: CircleAlert,
      iconClass: "bg-[#fae9e6] text-[#b7473f]",
      title: "Payment declined",
      detail: "Try a different payment method.",
      button: "Update card",
      buttonClass: "bg-[#b7473f]",
    },
    retry: {
      icon: RefreshCw,
      iconClass: "bg-[#fff2d8] text-[#a05d0b]",
      title: "Still processing",
      detail: "We could not confirm the charge.",
      button: "Try again",
      buttonClass: "bg-[#a05d0b]",
    },
  }[tone];
  const StatusIcon = status.icon;

  return (
    <div className={`flex h-full flex-col items-center justify-center text-center ${compact ? "gap-1 px-2 py-1.5" : "gap-1.5 px-5 py-3"}`}>
      <span className={`grid rounded-full ${compact ? "size-5" : "size-6"} place-items-center ${status.iconClass}`}>
        <StatusIcon className={compact ? "size-3" : "size-3.5"} strokeWidth={2.35} />
      </span>
      <div>
        <div className="text-[7px] font-bold leading-tight text-[#282a2e]">
          {status.title}
        </div>
        {!compact && (
          <div className="mt-0.5 text-[5.5px] leading-tight text-[#85827b]">
            {status.detail}
          </div>
        )}
      </div>
      <div className={`rounded-[3px] px-3 text-[5.5px] font-semibold leading-[14px] text-white ${status.buttonClass}`}>
        {status.button}
      </div>
    </div>
  );
}

function LoginPreview({ compact }: { compact: boolean }) {
  return (
    <div className={`grid h-full grid-cols-[0.7fr_1.3fr] ${compact ? "gap-2 p-2" : "gap-3 p-3"}`}>
      <div className="relative overflow-hidden rounded-[5px] bg-[#191b1f]">
        <div className="absolute -left-3 top-2 size-10 rounded-full border border-[#6657d9]/70" />
        <div className="absolute -bottom-4 right-[-8px] size-12 rounded-full bg-[#ee6f4d]/90" />
        <div className="relative flex h-full items-center justify-center">
          <LockKeyhole className="size-3.5 text-white" strokeWidth={1.8} />
        </div>
      </div>
      <div className="flex min-w-0 flex-col justify-center">
        <div className="mb-1.5 h-1.5 w-10 rounded-full bg-[#aaa69e]" />
        <div className="space-y-1">
          <div className="h-2.5 rounded-[3px] border border-[#dedbd3] bg-[#fbfaf6]" />
          <div className="h-2.5 rounded-[3px] border border-[#dedbd3] bg-[#fbfaf6]" />
        </div>
        <div className="mt-1.5 h-3 rounded-[3px] bg-[#6657d9]" />
      </div>
    </div>
  );
}

function OrdersPreview({ compact }: { compact: boolean }) {
  return (
    <div className={compact ? "p-2" : "p-3"}>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ShoppingBag className="size-2.5 text-[#6657d9]" strokeWidth={2.2} />
          <span className="text-[7px] font-bold text-[#282a2e]">Orders</span>
        </div>
        <div className="h-2 w-8 rounded-full bg-[#eeeae3]" />
      </div>
      <div className="space-y-1">
        {["bg-[#e5f4ef] text-[#267968]", "bg-[#eeebff] text-[#6657d9]", "bg-[#fff2d8] text-[#a05d0b]"].map(
          (tone, index) => (
            <div
              className="flex items-center gap-1.5 rounded-[4px] border border-[#ebe8e1] bg-[#fdfcf9] p-1"
              key={tone}
            >
              <span className={`grid size-3.5 shrink-0 place-items-center rounded-[3px] ${tone}`}>
                <PackageCheck className="size-2" strokeWidth={2.25} />
              </span>
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className={`block h-1 rounded-full bg-[#b9b6ae] ${index === 1 ? "w-10" : "w-8"}`} />
                <span className="block h-1 w-5 rounded-full bg-[#dedbd3]" />
              </span>
              <span className="h-1 w-4 rounded-full bg-[#c8c5bc]" />
            </div>
          ),
        )}
      </div>
    </div>
  );
}

/** A tiny, legible application screen used inside canvas nodes and inspectors. */
export function ScreenPreview({
  variant,
  compact = false,
}: ScreenPreviewProps) {
  return (
    <div
      aria-label={previewNames[variant]}
      className={`overflow-hidden rounded-[9px] border border-[#dfddd6] bg-white shadow-[0_1px_2px_rgba(25,27,31,0.06)] ${compact ? "h-[76px]" : "h-[118px]"}`}
      role="img"
    >
      <div aria-hidden="true" className="flex h-full flex-col">
        <PreviewChrome />
        <div className="min-h-0 flex-1">
          {variant === "checkout" && <CheckoutPreview compact={compact} />}
          {variant === "loading" && <LoadingPreview compact={compact} />}
          {variant === "success" && (
            <StatusPreview compact={compact} tone="success" />
          )}
          {variant === "error" && (
            <StatusPreview compact={compact} tone="error" />
          )}
          {variant === "retry" && (
            <StatusPreview compact={compact} tone="retry" />
          )}
          {variant === "login" && <LoginPreview compact={compact} />}
          {variant === "orders" && <OrdersPreview compact={compact} />}
        </div>
      </div>
    </div>
  );
}

export default ScreenPreview;
