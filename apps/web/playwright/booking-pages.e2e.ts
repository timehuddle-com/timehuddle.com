import { expect } from "@playwright/test";

import { test } from "./lib/fixtures";
import {
  bookFirstEvent,
  bookOptinEvent,
  bookTimeSlot,
  selectFirstAvailableTimeSlotNextMonth,
  testEmail,
  testName,
} from "./lib/testUtils";

test.describe.configure({ mode: "parallel" });
test.afterEach(async ({ users }) => users.deleteAll());

test.describe("free user", () => {
  test.beforeEach(async ({ page, users }) => {
    const free = await users.create();
    await page.goto(`/${free.username}`);
  });

  test("cannot book same slot multiple times", async ({ page }) => {
    // Click first event type
    await page.click('[data-testid="event-type-link"]');

    await selectFirstAvailableTimeSlotNextMonth(page);

    await bookTimeSlot(page);

    // save booking url
    const bookingUrl: string = page.url();

    // Make sure we're navigated to the success page
    await expect(page.locator("[data-testid=success-page]")).toBeVisible();

    // return to same time spot booking page
    await page.goto(bookingUrl);

    // book same time spot again
    await bookTimeSlot(page);

    await expect(page.locator("[data-testid=booking-fail]")).toBeVisible({ timeout: 1000 });
  });
});

test.describe("pro user", () => {
  test.beforeEach(async ({ page, users }) => {
    const pro = await users.create();
    await page.goto(`/${pro.username}`);
  });

  test("pro user's page has at least 2 visible events", async ({ page }) => {
    const $eventTypes = page.locator("[data-testid=event-types] > *");
    expect(await $eventTypes.count()).toBeGreaterThanOrEqual(2);
  });

  test("book an event first day in next month", async ({ page }) => {
    await bookFirstEvent(page);
  });

  test("can reschedule a booking", async ({ page, users, bookings }) => {
    const [pro] = users.get();
    const [eventType] = pro.eventTypes;
    await bookings.create(pro.id, pro.username, eventType.id);

    await pro.apiLogin();
    await page.goto("/bookings/upcoming");
    await page.waitForSelector('[data-testid="bookings"]');
    await page.locator('[data-testid="edit_booking"]').nth(0).click();
    await page.locator('[data-testid="reschedule"]').click();
    await page.waitForURL((url) => {
      const bookingId = url.searchParams.get("rescheduleUid");
      return !!bookingId;
    });
    await selectFirstAvailableTimeSlotNextMonth(page);

    await page.locator('[data-testid="confirm-reschedule-button"]').click();
    await page.waitForURL((url) => {
      return url.pathname.startsWith("/booking");
    });
  });

  test("Can cancel the recently created booking and rebook the same timeslot", async ({
    page,
    users,
  }, testInfo) => {
    // Because it tests the entire booking flow + the cancellation + rebooking
    test.setTimeout(testInfo.timeout * 3);
    await bookFirstEvent(page);
    await expect(page.locator(`[data-testid="attendee-email-${testEmail}"]`)).toHaveText(testEmail);
    await expect(page.locator(`[data-testid="attendee-name-${testName}"]`)).toHaveText(testName);

    const [pro] = users.get();
    await pro.apiLogin();

    await page.goto("/bookings/upcoming");
    await page.locator('[data-testid="cancel"]').click();
    await page.waitForURL((url) => {
      return url.pathname.startsWith("/booking/");
    });
    await page.locator('[data-testid="confirm_cancel"]').click();

    const cancelledHeadline = page.locator('[data-testid="cancelled-headline"]');
    await expect(cancelledHeadline).toBeVisible();

    await expect(page.locator(`[data-testid="attendee-email-${testEmail}"]`)).toHaveText(testEmail);
    await expect(page.locator(`[data-testid="attendee-name-${testName}"]`)).toHaveText(testName);

    await page.goto(`/${pro.username}`);
    await bookFirstEvent(page);
  });

  test("can book an event that requires confirmation and then that booking can be accepted by organizer", async ({
    page,
    users,
  }) => {
    await bookOptinEvent(page);
    const [pro] = users.get();
    await pro.apiLogin();

    await page.goto("/bookings/unconfirmed");
    await Promise.all([
      page.click('[data-testid="confirm"]'),
      page.waitForResponse((response) => response.url().includes("/api/trpc/bookings/confirm")),
    ]);
    // This is the only booking in there that needed confirmation and now it should be empty screen
    await expect(page.locator('[data-testid="empty-screen"]')).toBeVisible();
  });

  test("can book with multiple guests", async ({ page, users }) => {
    const additionalGuests = ["test@gmail.com", "test2@gmail.com"];

    await page.click('[data-testid="event-type-link"]');
    await selectFirstAvailableTimeSlotNextMonth(page);
    await page.fill('[name="name"]', "test1234");
    await page.fill('[name="email"]', "test1234@example.com");
    await page.locator('[data-testid="add-guests"]').click();

    await page.locator('input[type="email"]').nth(1).fill(additionalGuests[0]);
    await page.locator('[data-testid="add-another-guest"]').click();
    await page.locator('input[type="email"]').nth(2).fill(additionalGuests[1]);

    await page.locator('[data-testid="confirm-book-button"]').click();

    await expect(page.locator("[data-testid=success-page]")).toBeVisible();

    additionalGuests.forEach(async (email) => {
      await expect(page.locator(`[data-testid="attendee-email-${email}"]`)).toHaveText(email);
    });
  });

  test("Time slots should be reserved when selected", async ({ context, page }) => {
    await page.click('[data-testid="event-type-link"]');

    const initialUrl = page.url();
    await selectFirstAvailableTimeSlotNextMonth(page);
    const pageTwo = await context.newPage();
    await pageTwo.goto(initialUrl);
    await pageTwo.waitForURL(initialUrl);

    await pageTwo.waitForSelector('[data-testid="event-type-link"]');
    const eventTypeLink = pageTwo.locator('[data-testid="event-type-link"]').first();
    await eventTypeLink.click();

    await pageTwo.waitForLoadState("networkidle");
    await pageTwo.locator('[data-testid="incrementMonth"]').waitFor();
    await pageTwo.click('[data-testid="incrementMonth"]');
    await pageTwo.waitForLoadState("networkidle");
    await pageTwo.locator('[data-testid="day"][data-disabled="false"]').nth(0).waitFor();
    await pageTwo.locator('[data-testid="day"][data-disabled="false"]').nth(0).click();

    // 9:30 should be the first available time slot
    await pageTwo.locator('[data-testid="time"]').nth(0).waitFor();
    const firstSlotAvailable = pageTwo.locator('[data-testid="time"]').nth(0);
    // Find text inside the element
    const firstSlotAvailableText = await firstSlotAvailable.innerText();
    expect(firstSlotAvailableText).toContain("9:30");
  });

  test("Time slots are not reserved when going back via Cancel button on Event Form", async ({
    context,
    page,
  }) => {
    const initialUrl = page.url();
    await page.waitForSelector('[data-testid="event-type-link"]');
    const eventTypeLink = page.locator('[data-testid="event-type-link"]').first();
    await eventTypeLink.click();
    await selectFirstAvailableTimeSlotNextMonth(page);

    const pageTwo = await context.newPage();
    await pageTwo.goto(initialUrl);
    await pageTwo.waitForURL(initialUrl);

    await pageTwo.waitForSelector('[data-testid="event-type-link"]');
    const eventTypeLinkTwo = pageTwo.locator('[data-testid="event-type-link"]').first();
    await eventTypeLinkTwo.click();

    await page.locator('[data-testid="back"]').waitFor();
    await page.click('[data-testid="back"]');

    await pageTwo.waitForLoadState("networkidle");
    await pageTwo.locator('[data-testid="incrementMonth"]').waitFor();
    await pageTwo.click('[data-testid="incrementMonth"]');
    await pageTwo.waitForLoadState("networkidle");
    await pageTwo.locator('[data-testid="day"][data-disabled="false"]').nth(0).waitFor();
    await pageTwo.locator('[data-testid="day"][data-disabled="false"]').nth(0).click();

    await pageTwo.locator('[data-testid="time"]').nth(0).waitFor();
    const firstSlotAvailable = pageTwo.locator('[data-testid="time"]').nth(0);

    // Find text inside the element
    const firstSlotAvailableText = await firstSlotAvailable.innerText();
    expect(firstSlotAvailableText).toContain("9:00");
  });
});
