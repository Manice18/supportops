"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const links = [
  ["/desk", "Access"],
  ["/desk/calls", "Calls"],
  ["/desk/subscriptions", "Subscriptions"],
  ["/desk/customers", "Customers"],
  ["/desk/refunds", "Refunds"],
  ["/desk/credits", "Credits"],
  ["/desk/payments", "Payments"],
];
export function DeskNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Desk sections" className="tabs">
      {links.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className="tab"
          aria-current={
            pathname === href ||
            (href !== "/desk" && pathname.startsWith(href + "/"))
              ? "page"
              : undefined
          }
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
