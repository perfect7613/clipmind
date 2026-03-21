import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const event = body.type || body.event;

    switch (event) {
      case "subscription.created":
      case "subscription.active": {
        const email = body.data?.customer?.email || body.customer?.email;
        if (email) {
          await db.update(users).set({
            planTier: "pro",
            creditsRemaining: 50,
            updatedAt: new Date(),
          }).where(eq(users.email, email));
        }
        break;
      }

      case "subscription.cancelled":
      case "subscription.expired": {
        const email = body.data?.customer?.email || body.customer?.email;
        if (email) {
          await db.update(users).set({
            planTier: "free",
            creditsRemaining: 3,
            updatedAt: new Date(),
          }).where(eq(users.email, email));
        }
        break;
      }

      case "subscription.renewed": {
        const email = body.data?.customer?.email || body.customer?.email;
        if (email) {
          await db.update(users).set({
            creditsRemaining: 50,
            updatedAt: new Date(),
          }).where(eq(users.email, email));
        }
        break;
      }

      default:
        console.log("Unhandled webhook event:", event);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
