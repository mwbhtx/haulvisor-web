"use client";

import { OrderDetail } from "@/features/orders/components/order-detail";
import { useAuth } from "@/core/services/auth-provider";

export function OrderDetailClient({ orderId }: { orderId: string }) {
  const { activeCompanyId } = useAuth();

  if (!activeCompanyId) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        No company selected.
      </div>
    );
  }

  return <OrderDetail companyId={activeCompanyId} orderId={orderId} />;
}
