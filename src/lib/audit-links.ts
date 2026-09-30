/** Admin page for an audit log target (products have no detail page, so filter the table). */
export function auditTargetHref(targetType: string, targetId: string) {
  switch (targetType) {
    case "user":
      return `/admin/users/${targetId}`;
    case "auction":
      return `/admin/auctions/${targetId}`;
    case "order":
      return `/admin/orders/${targetId}`;
    case "product":
      return `/admin/products?q=${encodeURIComponent(targetId)}`;
    default:
      return null;
  }
}
