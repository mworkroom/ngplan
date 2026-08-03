import type { ManualPlanDraft } from '../../application/manual-plan';
import type { ProjectSetupBundle } from '../../application/project-setup';

/**
 * Sanitized regression fixture derived from the approved 202608A manual plan.
 * Cloud account, revision, project UUID, organization UUID, and member IDs are
 * deliberately excluded. The organization rules and direct allocation cells
 * are preserved.
 */
export const AUGUST_2026_FIRST_HALF_GOLD_BUNDLE = {
  "project": {
    "title": "202608A 민경욱",
    "period": {
      "half": "FIRST_HALF",
      "year": 2026,
      "month": 8
    },
    "timezone": "America/Sao_Paulo",
    "projectId": "fixture-202608a-min-kyung-wook",
    "projectStatus": "IN_PROGRESS",
    "organizationSnapshotId": "fixture-202608a-organization"
  },
  "organization": {
    "members": [
      {
        "name": "민경욱",
        "memberId": "fixture-root",
        "memberKey": "root",
        "pvpTarget": 2400,
        "sheetMarker": "PINK_1",
        "sideAtParent": null,
        "parentMemberKey": null,
        "fortnightSideTarget": 2500
      },
      {
        "name": "베로니카",
        "memberId": "fixture-veronica",
        "memberKey": "veronica",
        "pvpTarget": 1500,
        "sheetMarker": "GREEN_2",
        "sideAtParent": "LEFT",
        "parentMemberKey": "root",
        "fortnightSideTarget": 2500
      },
      {
        "name": "고규식",
        "memberId": "fixture-go-gyusik",
        "memberKey": "go-gyusik",
        "pvpTarget": 700,
        "sheetMarker": "NONE",
        "sideAtParent": "LEFT",
        "parentMemberKey": "veronica",
        "fortnightSideTarget": 1500
      },
      {
        "name": "김정미",
        "memberId": "fixture-kim-jeongmi",
        "memberKey": "kim-jeongmi",
        "pvpTarget": 700,
        "sheetMarker": "BLUE_3",
        "sideAtParent": "RIGHT",
        "parentMemberKey": "veronica",
        "fortnightSideTarget": 2500
      },
      {
        "name": "까리나 김",
        "memberId": "fixture-karina-kim",
        "memberKey": "karina-kim",
        "pvpTarget": 700,
        "sheetMarker": "NONE",
        "sideAtParent": "RIGHT",
        "parentMemberKey": "kim-jeongmi",
        "fortnightSideTarget": 1500
      },
      {
        "name": "캘리",
        "memberId": "fixture-kelly",
        "memberKey": "kelly",
        "pvpTarget": 2400,
        "sheetMarker": "GREEN_2",
        "sideAtParent": "RIGHT",
        "parentMemberKey": "root",
        "fortnightSideTarget": 2500
      },
      {
        "name": "남승우",
        "memberId": "fixture-nam-seungwoo",
        "memberKey": "nam-seungwoo",
        "pvpTarget": 2400,
        "sheetMarker": "BLUE_3",
        "sideAtParent": "LEFT",
        "parentMemberKey": "kelly",
        "fortnightSideTarget": 2500
      },
      {
        "name": "김길주",
        "memberId": "fixture-kim-gilju",
        "memberKey": "kim-gilju",
        "pvpTarget": 2400,
        "sheetMarker": "BLUE_3",
        "sideAtParent": "RIGHT",
        "parentMemberKey": "kelly",
        "fortnightSideTarget": 2500
      },
      {
        "name": "시아원",
        "memberId": "fixture-siawon",
        "memberKey": "siawon",
        "pvpTarget": 1500,
        "sheetMarker": "NONE",
        "sideAtParent": "LEFT",
        "parentMemberKey": "kim-gilju",
        "fortnightSideTarget": 2500
      },
      {
        "name": "박진숙",
        "memberId": "fixture-park-jinsook",
        "memberKey": "park-jinsook",
        "pvpTarget": 2400,
        "sheetMarker": "NONE",
        "sideAtParent": "LEFT",
        "parentMemberKey": "nam-seungwoo",
        "fortnightSideTarget": 2500
      }
    ],
    "snapshotId": "fixture-202608a-organization",
    "openingStateByMember": {
      "go-gyusik": {
        "dailyCarryPvp": 0,
        "dailyCarryLeft": 2587,
        "dailyCarryRight": 55,
        "openingQualificationPvp": 700,
        "fortnightPvpOpeningCredit": 700
      },
      "veronica": {
        "dailyCarryPvp": 0,
        "dailyCarryLeft": 0,
        "dailyCarryRight": 657,
        "openingQualificationPvp": 1500,
        "fortnightPvpOpeningCredit": 1500
      },
      "park-jinsook": {
        "dailyCarryPvp": 0,
        "dailyCarryLeft": 196,
        "dailyCarryRight": 2541,
        "openingQualificationPvp": 2400,
        "fortnightPvpOpeningCredit": 2400
      },
      "siawon": {
        "dailyCarryPvp": 0,
        "dailyCarryLeft": 0,
        "dailyCarryRight": 0,
        "openingQualificationPvp": 1500,
        "fortnightPvpOpeningCredit": 1500
      },
      "root": {
        "dailyCarryPvp": 0,
        "dailyCarryLeft": 160,
        "dailyCarryRight": 939,
        "openingQualificationPvp": 2400,
        "fortnightPvpOpeningCredit": 2400
      },
      "kelly": {
        "dailyCarryPvp": 0,
        "dailyCarryLeft": 0,
        "dailyCarryRight": 0,
        "openingQualificationPvp": 2400,
        "fortnightPvpOpeningCredit": 2400
      },
      "karina-kim": {
        "dailyCarryPvp": 0,
        "dailyCarryLeft": 0,
        "dailyCarryRight": 310,
        "openingQualificationPvp": 363,
        "fortnightPvpOpeningCredit": 363
      },
      "kim-jeongmi": {
        "dailyCarryPvp": 0,
        "dailyCarryLeft": 150,
        "dailyCarryRight": 613,
        "openingQualificationPvp": 700,
        "fortnightPvpOpeningCredit": 700
      },
      "nam-seungwoo": {
        "dailyCarryPvp": 0,
        "dailyCarryLeft": 2603,
        "dailyCarryRight": 57,
        "openingQualificationPvp": 2400,
        "fortnightPvpOpeningCredit": 2400
      },
      "kim-gilju": {
        "dailyCarryPvp": 0,
        "dailyCarryLeft": 5847,
        "dailyCarryRight": 0,
        "openingQualificationPvp": 2400,
        "fortnightPvpOpeningCredit": 2400
      }
    }
  }
} as const satisfies ProjectSetupBundle;

/**
 * The later corrected real-use opening keeps the historical zero-opening
 * fixture intact so both inputs remain independently reproducible.
 */
export const AUGUST_2026_FIRST_HALF_VERONICA_LEFT_235_BUNDLE = {
  ...AUGUST_2026_FIRST_HALF_GOLD_BUNDLE,
  organization: {
    ...AUGUST_2026_FIRST_HALF_GOLD_BUNDLE.organization,
    openingStateByMember: {
      ...AUGUST_2026_FIRST_HALF_GOLD_BUNDLE.organization.openingStateByMember,
      veronica: {
        ...AUGUST_2026_FIRST_HALF_GOLD_BUNDLE.organization.openingStateByMember
          .veronica,
        dailyCarryLeft: 235,
      },
    },
  },
} as const satisfies ProjectSetupBundle;

export const AUGUST_2026_FIRST_HALF_MOTHER_GOLD_DRAFT = {
  "cells": [
    {
      "pvp": "",
      "date": "2026-08-01",
      "selfLeft": "",
      "memberKey": "go-gyusik",
      "selfRight": "250"
    },
    {
      "pvp": "",
      "date": "2026-08-01",
      "memberKey": "veronica"
    },
    {
      "pvp": "",
      "date": "2026-08-01",
      "selfLeft": "",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "",
      "date": "2026-08-01",
      "selfLeft": "",
      "memberKey": "karina-kim",
      "selfRight": ""
    },
    {
      "pvp": "",
      "date": "2026-08-01",
      "memberKey": "root"
    },
    {
      "pvp": "",
      "date": "2026-08-01",
      "selfLeft": "110",
      "memberKey": "park-jinsook",
      "selfRight": ""
    },
    {
      "pvp": "",
      "date": "2026-08-01",
      "memberKey": "nam-seungwoo",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-01",
      "memberKey": "kelly"
    },
    {
      "pvp": "",
      "date": "2026-08-01",
      "selfLeft": "",
      "memberKey": "siawon",
      "selfRight": ""
    },
    {
      "pvp": "",
      "date": "2026-08-01",
      "memberKey": "kim-gilju",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "selfLeft": "0",
      "memberKey": "go-gyusik",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "memberKey": "veronica"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "selfLeft": "0",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "selfLeft": "0",
      "memberKey": "karina-kim",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "memberKey": "root"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "selfLeft": "0",
      "memberKey": "park-jinsook",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "memberKey": "nam-seungwoo",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "memberKey": "kelly"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "selfLeft": "0",
      "memberKey": "siawon",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "memberKey": "kim-gilju",
      "selfRight": "0"
    },
    {
      "pvp": "",
      "date": "2026-08-03",
      "selfLeft": "",
      "memberKey": "go-gyusik",
      "selfRight": "200"
    },
    {
      "pvp": "",
      "date": "2026-08-03",
      "memberKey": "veronica"
    },
    {
      "pvp": "",
      "date": "2026-08-03",
      "selfLeft": "150",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "",
      "date": "2026-08-03",
      "selfLeft": "",
      "memberKey": "karina-kim",
      "selfRight": ""
    },
    {
      "pvp": "",
      "date": "2026-08-03",
      "memberKey": "root"
    },
    {
      "pvp": "",
      "date": "2026-08-03",
      "selfLeft": "300",
      "memberKey": "park-jinsook",
      "selfRight": "100"
    },
    {
      "pvp": "",
      "date": "2026-08-03",
      "memberKey": "nam-seungwoo",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-03",
      "memberKey": "kelly"
    },
    {
      "pvp": "100",
      "date": "2026-08-03",
      "selfLeft": "300",
      "memberKey": "siawon",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-03",
      "memberKey": "kim-gilju",
      "selfRight": ""
    },
    {
      "pvp": "",
      "date": "2026-08-04",
      "selfLeft": "",
      "memberKey": "go-gyusik",
      "selfRight": "100"
    },
    {
      "pvp": "",
      "date": "2026-08-04",
      "memberKey": "veronica"
    },
    {
      "pvp": "",
      "date": "2026-08-04",
      "selfLeft": "300",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "0",
      "date": "2026-08-04",
      "selfLeft": "300",
      "memberKey": "karina-kim",
      "selfRight": ""
    },
    {
      "pvp": "",
      "date": "2026-08-04",
      "memberKey": "root"
    },
    {
      "pvp": "",
      "date": "2026-08-04",
      "selfLeft": "0",
      "memberKey": "park-jinsook",
      "selfRight": "200"
    },
    {
      "pvp": "",
      "date": "2026-08-04",
      "memberKey": "nam-seungwoo",
      "selfRight": "100"
    },
    {
      "pvp": "",
      "date": "2026-08-04",
      "memberKey": "kelly"
    },
    {
      "pvp": "",
      "date": "2026-08-04",
      "selfLeft": "100",
      "memberKey": "siawon",
      "selfRight": ""
    },
    {
      "pvp": "",
      "date": "2026-08-04",
      "memberKey": "kim-gilju",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-05",
      "selfLeft": "300",
      "memberKey": "go-gyusik",
      "selfRight": ""
    },
    {
      "pvp": "",
      "date": "2026-08-05",
      "memberKey": "veronica"
    },
    {
      "pvp": "",
      "date": "2026-08-05",
      "selfLeft": "300",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "100",
      "date": "2026-08-05",
      "selfLeft": "",
      "memberKey": "karina-kim",
      "selfRight": ""
    },
    {
      "pvp": "",
      "date": "2026-08-05",
      "memberKey": "root"
    },
    {
      "pvp": "",
      "date": "2026-08-05",
      "selfLeft": "300",
      "memberKey": "park-jinsook",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-05",
      "memberKey": "nam-seungwoo",
      "selfRight": "100"
    },
    {
      "pvp": "",
      "date": "2026-08-05",
      "memberKey": "kelly"
    },
    {
      "pvp": "",
      "date": "2026-08-05",
      "selfLeft": "300",
      "memberKey": "siawon",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-05",
      "memberKey": "kim-gilju",
      "selfRight": "100"
    },
    {
      "pvp": "",
      "date": "2026-08-06",
      "selfLeft": "",
      "memberKey": "go-gyusik",
      "selfRight": "200"
    },
    {
      "pvp": "",
      "date": "2026-08-06",
      "memberKey": "veronica"
    },
    {
      "pvp": "",
      "date": "2026-08-06",
      "selfLeft": "",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "",
      "date": "2026-08-06",
      "selfLeft": "",
      "memberKey": "karina-kim",
      "selfRight": "200"
    },
    {
      "pvp": "",
      "date": "2026-08-06",
      "memberKey": "root"
    },
    {
      "pvp": "",
      "date": "2026-08-06",
      "selfLeft": "",
      "memberKey": "park-jinsook",
      "selfRight": "200"
    },
    {
      "pvp": "",
      "date": "2026-08-06",
      "memberKey": "nam-seungwoo",
      "selfRight": "100"
    },
    {
      "pvp": "",
      "date": "2026-08-06",
      "memberKey": "kelly"
    },
    {
      "pvp": "",
      "date": "2026-08-06",
      "selfLeft": "",
      "memberKey": "siawon",
      "selfRight": ""
    },
    {
      "pvp": "",
      "date": "2026-08-06",
      "memberKey": "kim-gilju",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-07",
      "selfLeft": "",
      "memberKey": "go-gyusik",
      "selfRight": "100"
    },
    {
      "pvp": "",
      "date": "2026-08-07",
      "memberKey": "veronica"
    },
    {
      "pvp": "",
      "date": "2026-08-07",
      "selfLeft": "300",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "",
      "date": "2026-08-07",
      "selfLeft": "300",
      "memberKey": "karina-kim",
      "selfRight": ""
    },
    {
      "pvp": "",
      "date": "2026-08-07",
      "memberKey": "root"
    },
    {
      "pvp": "",
      "date": "2026-08-07",
      "selfLeft": "300",
      "memberKey": "park-jinsook",
      "selfRight": "100"
    },
    {
      "pvp": "",
      "date": "2026-08-07",
      "memberKey": "nam-seungwoo",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-07",
      "memberKey": "kelly"
    },
    {
      "pvp": "",
      "date": "2026-08-07",
      "selfLeft": "300",
      "memberKey": "siawon",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-07",
      "memberKey": "kim-gilju",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-08",
      "selfLeft": "300",
      "memberKey": "go-gyusik",
      "selfRight": ""
    },
    {
      "pvp": "",
      "date": "2026-08-08",
      "memberKey": "veronica"
    },
    {
      "pvp": "",
      "date": "2026-08-08",
      "selfLeft": "300",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "100",
      "date": "2026-08-08",
      "selfLeft": "",
      "memberKey": "karina-kim",
      "selfRight": "200"
    },
    {
      "pvp": "",
      "date": "2026-08-08",
      "memberKey": "root"
    },
    {
      "pvp": "",
      "date": "2026-08-08",
      "selfLeft": "300",
      "memberKey": "park-jinsook",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-08",
      "memberKey": "nam-seungwoo",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-08",
      "memberKey": "kelly"
    },
    {
      "pvp": "",
      "date": "2026-08-08",
      "selfLeft": "300",
      "memberKey": "siawon",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-08",
      "memberKey": "kim-gilju",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "selfLeft": "0",
      "memberKey": "go-gyusik",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "memberKey": "veronica"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "selfLeft": "0",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "selfLeft": "0",
      "memberKey": "karina-kim",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "memberKey": "root"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "selfLeft": "0",
      "memberKey": "park-jinsook",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "memberKey": "nam-seungwoo",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "memberKey": "kelly"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "selfLeft": "0",
      "memberKey": "siawon",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "memberKey": "kim-gilju",
      "selfRight": "0"
    },
    {
      "pvp": "",
      "date": "2026-08-10",
      "selfLeft": "",
      "memberKey": "go-gyusik",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-10",
      "memberKey": "veronica"
    },
    {
      "pvp": "",
      "date": "2026-08-10",
      "selfLeft": "100",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "",
      "date": "2026-08-10",
      "selfLeft": "300",
      "memberKey": "karina-kim",
      "selfRight": ""
    },
    {
      "pvp": "",
      "date": "2026-08-10",
      "memberKey": "root"
    },
    {
      "pvp": "",
      "date": "2026-08-10",
      "selfLeft": "300",
      "memberKey": "park-jinsook",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-10",
      "memberKey": "nam-seungwoo",
      "selfRight": "100"
    },
    {
      "pvp": "",
      "date": "2026-08-10",
      "memberKey": "kelly"
    },
    {
      "pvp": "",
      "date": "2026-08-10",
      "selfLeft": "300",
      "memberKey": "siawon",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-10",
      "memberKey": "kim-gilju",
      "selfRight": "100"
    },
    {
      "pvp": "",
      "date": "2026-08-11",
      "selfLeft": "300",
      "memberKey": "go-gyusik",
      "selfRight": ""
    },
    {
      "pvp": "",
      "date": "2026-08-11",
      "memberKey": "veronica"
    },
    {
      "pvp": "",
      "date": "2026-08-11",
      "selfLeft": "200",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "",
      "date": "2026-08-11",
      "selfLeft": "",
      "memberKey": "karina-kim",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-11",
      "memberKey": "root"
    },
    {
      "pvp": "",
      "date": "2026-08-11",
      "selfLeft": "300",
      "memberKey": "park-jinsook",
      "selfRight": "200"
    },
    {
      "pvp": "",
      "date": "2026-08-11",
      "memberKey": "nam-seungwoo",
      "selfRight": "200"
    },
    {
      "pvp": "",
      "date": "2026-08-11",
      "memberKey": "kelly"
    },
    {
      "pvp": "",
      "date": "2026-08-11",
      "selfLeft": "300",
      "memberKey": "siawon",
      "selfRight": "200"
    },
    {
      "pvp": "",
      "date": "2026-08-11",
      "memberKey": "kim-gilju",
      "selfRight": "200"
    },
    {
      "pvp": "",
      "date": "2026-08-12",
      "selfLeft": "300",
      "memberKey": "go-gyusik",
      "selfRight": "100"
    },
    {
      "pvp": "",
      "date": "2026-08-12",
      "memberKey": "veronica"
    },
    {
      "pvp": "",
      "date": "2026-08-12",
      "selfLeft": "100",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "",
      "date": "2026-08-12",
      "selfLeft": "300",
      "memberKey": "karina-kim",
      "selfRight": ""
    },
    {
      "pvp": "",
      "date": "2026-08-12",
      "memberKey": "root"
    },
    {
      "pvp": "",
      "date": "2026-08-12",
      "selfLeft": "",
      "memberKey": "park-jinsook",
      "selfRight": "100"
    },
    {
      "pvp": "",
      "date": "2026-08-12",
      "memberKey": "nam-seungwoo",
      "selfRight": "200"
    },
    {
      "pvp": "",
      "date": "2026-08-12",
      "memberKey": "kelly"
    },
    {
      "pvp": "",
      "date": "2026-08-12",
      "selfLeft": "",
      "memberKey": "siawon",
      "selfRight": "100"
    },
    {
      "pvp": "",
      "date": "2026-08-12",
      "memberKey": "kim-gilju",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-13",
      "selfLeft": "",
      "memberKey": "go-gyusik",
      "selfRight": "200"
    },
    {
      "pvp": "",
      "date": "2026-08-13",
      "memberKey": "veronica"
    },
    {
      "pvp": "",
      "date": "2026-08-13",
      "selfLeft": "200",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "200",
      "date": "2026-08-13",
      "selfLeft": "100",
      "memberKey": "karina-kim",
      "selfRight": ""
    },
    {
      "pvp": "",
      "date": "2026-08-13",
      "memberKey": "root"
    },
    {
      "pvp": "",
      "date": "2026-08-13",
      "selfLeft": "300",
      "memberKey": "park-jinsook",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-13",
      "memberKey": "nam-seungwoo",
      "selfRight": "100"
    },
    {
      "pvp": "",
      "date": "2026-08-13",
      "memberKey": "kelly"
    },
    {
      "pvp": "",
      "date": "2026-08-13",
      "selfLeft": "300",
      "memberKey": "siawon",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-13",
      "memberKey": "kim-gilju",
      "selfRight": ""
    },
    {
      "pvp": "",
      "date": "2026-08-14",
      "selfLeft": "300",
      "memberKey": "go-gyusik",
      "selfRight": ""
    },
    {
      "pvp": "",
      "date": "2026-08-14",
      "memberKey": "veronica"
    },
    {
      "pvp": "",
      "date": "2026-08-14",
      "selfLeft": "300",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "",
      "date": "2026-08-14",
      "selfLeft": "200",
      "memberKey": "karina-kim",
      "selfRight": "100"
    },
    {
      "pvp": "",
      "date": "2026-08-14",
      "memberKey": "root"
    },
    {
      "pvp": "",
      "date": "2026-08-14",
      "selfLeft": "300",
      "memberKey": "park-jinsook",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-14",
      "memberKey": "nam-seungwoo",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-14",
      "memberKey": "kelly"
    },
    {
      "pvp": "",
      "date": "2026-08-14",
      "selfLeft": "300",
      "memberKey": "siawon",
      "selfRight": "100"
    },
    {
      "pvp": "",
      "date": "2026-08-14",
      "memberKey": "kim-gilju",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-15",
      "selfLeft": "",
      "memberKey": "go-gyusik",
      "selfRight": "50"
    },
    {
      "pvp": "",
      "date": "2026-08-15",
      "memberKey": "veronica"
    },
    {
      "pvp": "250",
      "date": "2026-08-15",
      "selfLeft": "",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "",
      "date": "2026-08-15",
      "selfLeft": "",
      "memberKey": "karina-kim",
      "selfRight": "300"
    },
    {
      "pvp": "",
      "date": "2026-08-15",
      "memberKey": "root"
    },
    {
      "pvp": "",
      "date": "2026-08-15",
      "selfLeft": "",
      "memberKey": "park-jinsook",
      "selfRight": "100"
    },
    {
      "pvp": "",
      "date": "2026-08-15",
      "memberKey": "nam-seungwoo",
      "selfRight": "100"
    },
    {
      "pvp": "",
      "date": "2026-08-15",
      "memberKey": "kelly"
    },
    {
      "pvp": "",
      "date": "2026-08-15",
      "selfLeft": "",
      "memberKey": "siawon",
      "selfRight": "200"
    },
    {
      "pvp": "",
      "date": "2026-08-15",
      "memberKey": "kim-gilju",
      "selfRight": ""
    }
  ],
  "actualDifferenceMarkers": [
    {
      "date": "2026-08-01",
      "memberKey": "veronica"
    }
  ]
} as const satisfies ManualPlanDraft;

export const AUGUST_2026_FIRST_HALF_POLICY_8_BASELINE_DRAFT = {
  "cells": [
    {
      "pvp": "0",
      "date": "2026-08-01",
      "selfLeft": "0",
      "memberKey": "go-gyusik",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-01",
      "memberKey": "veronica"
    },
    {
      "pvp": "0",
      "date": "2026-08-01",
      "selfLeft": "200",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "0",
      "date": "2026-08-01",
      "selfLeft": "100",
      "memberKey": "karina-kim",
      "selfRight": "163"
    },
    {
      "pvp": "0",
      "date": "2026-08-01",
      "memberKey": "root"
    },
    {
      "pvp": "0",
      "date": "2026-08-01",
      "selfLeft": "300",
      "memberKey": "park-jinsook",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-01",
      "memberKey": "nam-seungwoo",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-01",
      "memberKey": "kelly"
    },
    {
      "pvp": "0",
      "date": "2026-08-01",
      "selfLeft": "300",
      "memberKey": "siawon",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-01",
      "memberKey": "kim-gilju",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "selfLeft": "0",
      "memberKey": "go-gyusik",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "memberKey": "veronica"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "selfLeft": "0",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "selfLeft": "0",
      "memberKey": "karina-kim",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "memberKey": "root"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "selfLeft": "0",
      "memberKey": "park-jinsook",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "memberKey": "nam-seungwoo",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "memberKey": "kelly"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "selfLeft": "0",
      "memberKey": "siawon",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-02",
      "memberKey": "kim-gilju",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-03",
      "selfLeft": "200",
      "memberKey": "go-gyusik",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-03",
      "memberKey": "veronica"
    },
    {
      "pvp": "0",
      "date": "2026-08-03",
      "selfLeft": "200",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "0",
      "date": "2026-08-03",
      "selfLeft": "100",
      "memberKey": "karina-kim",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-03",
      "memberKey": "root"
    },
    {
      "pvp": "0",
      "date": "2026-08-03",
      "selfLeft": "300",
      "memberKey": "park-jinsook",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-03",
      "memberKey": "nam-seungwoo",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-03",
      "memberKey": "kelly"
    },
    {
      "pvp": "0",
      "date": "2026-08-03",
      "selfLeft": "0",
      "memberKey": "siawon",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-03",
      "memberKey": "kim-gilju",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-04",
      "selfLeft": "200",
      "memberKey": "go-gyusik",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-04",
      "memberKey": "veronica"
    },
    {
      "pvp": "0",
      "date": "2026-08-04",
      "selfLeft": "200",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "0",
      "date": "2026-08-04",
      "selfLeft": "100",
      "memberKey": "karina-kim",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-04",
      "memberKey": "root"
    },
    {
      "pvp": "0",
      "date": "2026-08-04",
      "selfLeft": "0",
      "memberKey": "park-jinsook",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-04",
      "memberKey": "nam-seungwoo",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-04",
      "memberKey": "kelly"
    },
    {
      "pvp": "0",
      "date": "2026-08-04",
      "selfLeft": "300",
      "memberKey": "siawon",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-04",
      "memberKey": "kim-gilju",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-05",
      "selfLeft": "200",
      "memberKey": "go-gyusik",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-05",
      "memberKey": "veronica"
    },
    {
      "pvp": "0",
      "date": "2026-08-05",
      "selfLeft": "200",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "0",
      "date": "2026-08-05",
      "selfLeft": "100",
      "memberKey": "karina-kim",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-05",
      "memberKey": "root"
    },
    {
      "pvp": "0",
      "date": "2026-08-05",
      "selfLeft": "300",
      "memberKey": "park-jinsook",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-05",
      "memberKey": "nam-seungwoo",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-05",
      "memberKey": "kelly"
    },
    {
      "pvp": "0",
      "date": "2026-08-05",
      "selfLeft": "300",
      "memberKey": "siawon",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-05",
      "memberKey": "kim-gilju",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-06",
      "selfLeft": "100",
      "memberKey": "go-gyusik",
      "selfRight": "200"
    },
    {
      "pvp": "0",
      "date": "2026-08-06",
      "memberKey": "veronica"
    },
    {
      "pvp": "0",
      "date": "2026-08-06",
      "selfLeft": "200",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "0",
      "date": "2026-08-06",
      "selfLeft": "100",
      "memberKey": "karina-kim",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-06",
      "memberKey": "root"
    },
    {
      "pvp": "0",
      "date": "2026-08-06",
      "selfLeft": "300",
      "memberKey": "park-jinsook",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-06",
      "memberKey": "nam-seungwoo",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-06",
      "memberKey": "kelly"
    },
    {
      "pvp": "0",
      "date": "2026-08-06",
      "selfLeft": "0",
      "memberKey": "siawon",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-06",
      "memberKey": "kim-gilju",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-07",
      "selfLeft": "100",
      "memberKey": "go-gyusik",
      "selfRight": "200"
    },
    {
      "pvp": "0",
      "date": "2026-08-07",
      "memberKey": "veronica"
    },
    {
      "pvp": "0",
      "date": "2026-08-07",
      "selfLeft": "200",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "0",
      "date": "2026-08-07",
      "selfLeft": "100",
      "memberKey": "karina-kim",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-07",
      "memberKey": "root"
    },
    {
      "pvp": "0",
      "date": "2026-08-07",
      "selfLeft": "0",
      "memberKey": "park-jinsook",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-07",
      "memberKey": "nam-seungwoo",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-07",
      "memberKey": "kelly"
    },
    {
      "pvp": "0",
      "date": "2026-08-07",
      "selfLeft": "300",
      "memberKey": "siawon",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-07",
      "memberKey": "kim-gilju",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-08",
      "selfLeft": "100",
      "memberKey": "go-gyusik",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-08",
      "memberKey": "veronica"
    },
    {
      "pvp": "0",
      "date": "2026-08-08",
      "selfLeft": "200",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "0",
      "date": "2026-08-08",
      "selfLeft": "100",
      "memberKey": "karina-kim",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-08",
      "memberKey": "root"
    },
    {
      "pvp": "0",
      "date": "2026-08-08",
      "selfLeft": "300",
      "memberKey": "park-jinsook",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-08",
      "memberKey": "nam-seungwoo",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-08",
      "memberKey": "kelly"
    },
    {
      "pvp": "0",
      "date": "2026-08-08",
      "selfLeft": "300",
      "memberKey": "siawon",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-08",
      "memberKey": "kim-gilju",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "selfLeft": "0",
      "memberKey": "go-gyusik",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "memberKey": "veronica"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "selfLeft": "0",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "selfLeft": "0",
      "memberKey": "karina-kim",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "memberKey": "root"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "selfLeft": "0",
      "memberKey": "park-jinsook",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "memberKey": "nam-seungwoo",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "memberKey": "kelly"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "selfLeft": "0",
      "memberKey": "siawon",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-09",
      "memberKey": "kim-gilju",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-10",
      "selfLeft": "100",
      "memberKey": "go-gyusik",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-10",
      "memberKey": "veronica"
    },
    {
      "pvp": "0",
      "date": "2026-08-10",
      "selfLeft": "100",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "37",
      "date": "2026-08-10",
      "selfLeft": "100",
      "memberKey": "karina-kim",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-10",
      "memberKey": "root"
    },
    {
      "pvp": "0",
      "date": "2026-08-10",
      "selfLeft": "300",
      "memberKey": "park-jinsook",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-10",
      "memberKey": "nam-seungwoo",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-10",
      "memberKey": "kelly"
    },
    {
      "pvp": "0",
      "date": "2026-08-10",
      "selfLeft": "0",
      "memberKey": "siawon",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-10",
      "memberKey": "kim-gilju",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-11",
      "selfLeft": "100",
      "memberKey": "go-gyusik",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-11",
      "memberKey": "veronica"
    },
    {
      "pvp": "0",
      "date": "2026-08-11",
      "selfLeft": "200",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "100",
      "date": "2026-08-11",
      "selfLeft": "100",
      "memberKey": "karina-kim",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-11",
      "memberKey": "root"
    },
    {
      "pvp": "0",
      "date": "2026-08-11",
      "selfLeft": "0",
      "memberKey": "park-jinsook",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-11",
      "memberKey": "nam-seungwoo",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-11",
      "memberKey": "kelly"
    },
    {
      "pvp": "0",
      "date": "2026-08-11",
      "selfLeft": "300",
      "memberKey": "siawon",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-11",
      "memberKey": "kim-gilju",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-12",
      "selfLeft": "100",
      "memberKey": "go-gyusik",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-12",
      "memberKey": "veronica"
    },
    {
      "pvp": "0",
      "date": "2026-08-12",
      "selfLeft": "200",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "100",
      "date": "2026-08-12",
      "selfLeft": "100",
      "memberKey": "karina-kim",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-12",
      "memberKey": "root"
    },
    {
      "pvp": "0",
      "date": "2026-08-12",
      "selfLeft": "300",
      "memberKey": "park-jinsook",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-12",
      "memberKey": "nam-seungwoo",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-12",
      "memberKey": "kelly"
    },
    {
      "pvp": "0",
      "date": "2026-08-12",
      "selfLeft": "300",
      "memberKey": "siawon",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-12",
      "memberKey": "kim-gilju",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-13",
      "selfLeft": "100",
      "memberKey": "go-gyusik",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-13",
      "memberKey": "veronica"
    },
    {
      "pvp": "0",
      "date": "2026-08-13",
      "selfLeft": "200",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "100",
      "date": "2026-08-13",
      "selfLeft": "100",
      "memberKey": "karina-kim",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-13",
      "memberKey": "root"
    },
    {
      "pvp": "0",
      "date": "2026-08-13",
      "selfLeft": "100",
      "memberKey": "park-jinsook",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-13",
      "memberKey": "nam-seungwoo",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-13",
      "memberKey": "kelly"
    },
    {
      "pvp": "0",
      "date": "2026-08-13",
      "selfLeft": "0",
      "memberKey": "siawon",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-13",
      "memberKey": "kim-gilju",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-14",
      "selfLeft": "100",
      "memberKey": "go-gyusik",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-14",
      "memberKey": "veronica"
    },
    {
      "pvp": "0",
      "date": "2026-08-14",
      "selfLeft": "200",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "0",
      "date": "2026-08-14",
      "selfLeft": "200",
      "memberKey": "karina-kim",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-14",
      "memberKey": "root"
    },
    {
      "pvp": "0",
      "date": "2026-08-14",
      "selfLeft": "300",
      "memberKey": "park-jinsook",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-14",
      "memberKey": "nam-seungwoo",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-14",
      "memberKey": "kelly"
    },
    {
      "pvp": "0",
      "date": "2026-08-14",
      "selfLeft": "300",
      "memberKey": "siawon",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-14",
      "memberKey": "kim-gilju",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-15",
      "selfLeft": "100",
      "memberKey": "go-gyusik",
      "selfRight": "100"
    },
    {
      "pvp": "0",
      "date": "2026-08-15",
      "memberKey": "veronica"
    },
    {
      "pvp": "0",
      "date": "2026-08-15",
      "selfLeft": "200",
      "memberKey": "kim-jeongmi"
    },
    {
      "pvp": "0",
      "date": "2026-08-15",
      "selfLeft": "200",
      "memberKey": "karina-kim",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-15",
      "memberKey": "root"
    },
    {
      "pvp": "0",
      "date": "2026-08-15",
      "selfLeft": "0",
      "memberKey": "park-jinsook",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-15",
      "memberKey": "nam-seungwoo",
      "selfRight": "0"
    },
    {
      "pvp": "0",
      "date": "2026-08-15",
      "memberKey": "kelly"
    },
    {
      "pvp": "0",
      "date": "2026-08-15",
      "selfLeft": "100",
      "memberKey": "siawon",
      "selfRight": "300"
    },
    {
      "pvp": "0",
      "date": "2026-08-15",
      "memberKey": "kim-gilju",
      "selfRight": "100"
    }
  ],
  "actualDifferenceMarkers": []
} as const satisfies ManualPlanDraft;
