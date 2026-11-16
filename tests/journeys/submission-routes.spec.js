const { test, expect } = require("@playwright/test");

const DRAFT_KEY = "tlc_member_draft_v1";
const routeDetails = {
  visitor: {
    reviewButton: "Submit my details",
    publicId: "V 900001",
    walletEligible: false,
  },
  attendee: {
    reviewButton: "Submit for review",
    publicId: "AT 900002",
    walletEligible: false,
  },
  member: {
    reviewButton: "Submit for review",
    publicId: "CM 900003",
    walletEligible: true,
  },
};

function profileChanges(journeyType) {
  return {
    firstName: journeyType === "visitor" ? "Visitor" : journeyType === "attendee" ? "Attender" : "Connect",
    lastName: "Regression",
    email: `${journeyType}@example.test`,
    phone: "+447700900000",
    gender: "Female",
    tlcLocation: "North London",
    membershipStatus: journeyType,
    connectCompleted: journeyType === "member" ? "yes" : journeyType === "visitor" ? "no" : "no_or_unsure",
    consent: "No",
    communicationPreference: [],
  };
}

async function seedJourney(page, journeyType, step, pendingUpdate = null) {
  const changes = pendingUpdate || profileChanges(journeyType);
  await page.addInitScript(
    ({ key, journeyType, step, changes }) => {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          expiresAt: Date.now() + 60 * 60 * 1000,
          formDraft: changes,
          pendingUpdate: step >= 6 ? changes : null,
          workflow: {
            step,
            campaignStarted: true,
            journeyType,
            search: `${changes.firstName} ${changes.lastName}`,
            sessionToken: `regression-session-${journeyType}`,
            selected: { id: `profile-${journeyType}`, ...changes },
            manualReview: journeyType === "visitor",
            verified: journeyType !== "visitor",
            otpSent: false,
            verificationUnavailable: false,
            deliveryMethod: "both",
            matchedDuplicateIds: [],
            duplicateCandidates: [],
            duplicateChoices: {},
            duplicateIndex: 0,
            internalReviewCount: 0,
            groupSelections: [],
            activeGroupTypeId: "",
            profileFormPage: 1,
          },
        }),
      );
    },
    { key: DRAFT_KEY, journeyType, step, changes },
  );
}

async function mockMemberServices(page, journeyType, submittedBodies) {
  await page.route("**/api/service-status", (route) =>
    route.fulfill({ json: { ok: true, delivery: { sms: true, email: true } } }),
  );
  await page.route("**/api/member", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "submit") {
      submittedBodies.push(body);
      const details = routeDetails[journeyType];
      return route.fulfill({
        json: {
          ok: true,
          recordId: 100,
          identity: {
            publicId: details.publicId,
            walletEligible: details.walletEligible,
          },
        },
      });
    }
    if (body.action === "groupTypes")
      return route.fulfill({
        json: {
          ok: true,
          types: [{ id: "regression-team", name: "Serving Teams" }],
        },
      });
    return route.fulfill({ json: { ok: true } });
  });
}

for (const journeyType of ["visitor", "attendee", "member"]) {
  test(`${journeyType} route validates, submits and reaches the card`, async ({ page }) => {
    const submittedBodies = [];
    await seedJourney(page, journeyType, 6);
    await mockMemberServices(page, journeyType, submittedBodies);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Check your information" })).toBeVisible();
    await page.getByRole("button", { name: routeDetails[journeyType].reviewButton }).click();

    await expect(page.getByRole("heading", { name: "Tell us honestly how church life is for you." })).toBeVisible();
    expect(submittedBodies).toHaveLength(1);
    expect(submittedBodies[0].changes.membershipStatus).toBe(journeyType);
    expect(submittedBodies[0].changes.connectCompleted).toBe(
      journeyType === "member" ? "yes" : journeyType === "visitor" ? "no" : "no_or_unsure",
    );

    await expect(page.getByRole("button", { name: "Start the survey" })).toBeVisible();
    await page.getByRole("link", { name: "Skip for now and get my card" }).click();
    await expect(page.getByText("You’re counted.")).toBeVisible();
    const [roleCode, number] = routeDetails[journeyType].publicId.split(" ");
    const card = page.locator(".youcount-card-preview");
    await expect(card).toContainText(roleCode);
    await expect(card).toContainText(number);
    await expect(page.getByRole("button", { name: "Take the survey" })).toBeVisible();

    await page.getByRole("button", { name: "Start again" }).click();
    await expect(page.getByRole("button", { name: /Get my YouCount Number/i })).toBeVisible();
    const draft = await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY);
    expect(draft).toBeNull();
  });

  test(`${journeyType} route shows an inline required-field error`, async ({ page }) => {
    const changes = profileChanges(journeyType);
    if (journeyType === "visitor") {
      changes.phone = "";
      changes.email = "";
      changes.gender = "";
      changes.tlcLocation = "";
    } else {
      changes.gender = "";
      changes.maritalStatus = "";
    }
    await seedJourney(page, journeyType, 5, changes);
    await mockMemberServices(page, journeyType, []);
    await page.goto("/");

    if (journeyType === "visitor") {
      await page.getByRole("button", { name: /Review my details/i }).click();
      await expect(page.getByRole("alert")).toContainText("Please complete");
      await expect(page.locator(".field-error").first()).toBeVisible();
    } else {
      await page.getByRole("button", { name: "Next →" }).click();
      await expect(page.locator(".wizard-validation-message")).toContainText("Part 1 needs");
      await expect(page.locator(".field-error").first()).toBeVisible();
    }
  });
}
