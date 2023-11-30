import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import axios, { AxiosError } from "axios";
import { isAfter, isBefore, setHours, setMinutes } from "date-fns";
import FormData from "form-data";
import LoopsClient from "loops";
import z from "zod";

import {
  getUserByStravaAthleteID,
  updateUserStravaTokens,
} from "~/models/user.server";

// adapted from https://developers.strava.com/docs/webhookexample/
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = process.env.STRAVA_VERIFY_TOKEN;
  if (mode && token) {
    // Verifies that the mode and token sent are valid
    if (mode === "subscribe" && token === verifyToken) {
      // Responds with the challenge token from the request
      return json({ "hub.challenge": challenge });
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      return new Response("", {
        status: 403,
      });
    }
  }
}

// schema for the object strava sends to the webhook
// https://developers.strava.com/docs/webhooks/
const webhookSchema = z.object({
  aspect_type: z
    .literal("create")
    .or(z.literal("update").or(z.literal("delete"))),
  event_time: z.number(),
  object_id: z.number(),
  object_type: z.literal("activity").or(z.literal("athlete")),
  owner_id: z.number(),
  subscription_id: z.number(),
  updates: z.object({}),
});

// schema for the refresh token response
// https://developers.strava.com/docs/authentication/#refreshingexpiredaccesstokens
const refreshTokenResponseSchema = z.object({
  token_type: z.literal("Bearer"),
  access_token: z.string(),
  expires_at: z.number(),
  expires_in: z.number(),
  refresh_token: z.string(),
});

// schema for the response to getting an activity (the parts we care about)
// https://developers.strava.com/docs/reference/#api-Activities-getActivityById
const activitySchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  commute: z.boolean(),
  trainer: z.boolean(),
  type: z.string(),
  upload_id: z.number(),
  elapsed_time: z.number(),
  start_date: z.string(),
  start_date_local: z.string(),
  utc_offset: z.number(), // subtract this value from start_date_local to get the UTC time
});

// schema for the response to getting an activity's streams
// https://developers.strava.com/docs/reference/#api-Streams-getActivityStreams
const baseStreamSchema = z.object({
  type: z.string(),
  original_size: z.number(),
  resolution: z.string(),
  series_type: z.string(),
  data: z.array(z.any()),
});
const getActivityStreamsResponseSchema = z.array(baseStreamSchema);

// schema for upload response
//developers.strava.com/docs/reference/#api-Uploads-createUpload
const uploadResponseSchema = z.object({
  id: z.number(),
  id_str: z.string(),
  error: z.string().nullable(),
  status: z.string(),
  activity_id: z.number().nullable(),
});

interface AllStreams {
  altitude?: number[];
  cadence?: number[];
  heartrate?: number[];
  latlng: number[][];
  power?: number[];
  temp?: number[];
  time: number[];
}

function organizeStreamData(
  streams: z.infer<typeof getActivityStreamsResponseSchema>,
): AllStreams {
  const altitude =
    streams.find((s) => s.type === "altitude")?.data ?? undefined;
  const cadence = streams.find((s) => s.type === "cadence")?.data ?? undefined;
  const heartrate =
    streams.find((s) => s.type === "heartrate")?.data ?? undefined;
  const latlng = streams.find((s) => s.type === "latlng")?.data ?? undefined;
  if (!latlng) {
    throw new Error("no latlng stream");
  }
  const power = streams.find((s) => s.type === "watts")?.data ?? undefined;
  const temp = streams.find((s) => s.type === "temp")?.data ?? undefined;
  const time = streams.find((s) => s.type === "time")?.data ?? undefined;
  if (!time) {
    throw new Error("no time stream");
  }
  return {
    altitude,
    cadence,
    heartrate,
    latlng,
    power,
    temp,
    time,
  };
}

// formatDate for the gpx file
function formatDate(date: Date): string {
  const pad = (num: number): string => num.toString().padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1); // getMonth() returns 0-11
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
}

// addSeconds to a date
function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

// getDifferenceInSeconds between two dates
function getDifferenceInSeconds(date1: Date, date2: Date): number {
  return (date1.getTime() - date2.getTime()) / 1000;
}

// HourAndMinute encodes a time of day in hours and minutes at 15 minute increments: 00, 15, 30, 45
interface HourAndMinute {
  hour: number;
  minute: number;
}

function isBetweenTimeBounds(
  date: Date,
  lowerBound: HourAndMinute,
  upperBound: HourAndMinute,
): boolean {
  // Create a date object for the lower bound on the same day
  const lowerBoundDate = setMinutes(
    setHours(date, lowerBound.hour),
    lowerBound.minute,
  );

  // Create a date object for the upper bound on the same day
  const upperBoundDate = setMinutes(
    setHours(date, upperBound.hour),
    upperBound.minute,
  );

  // Check if the date is after the lower bound and before the upper bound
  return isAfter(date, lowerBoundDate) && isBefore(date, upperBoundDate);
}

// synthetic test for this:
// curl -X POST -H "Content-Type: application/json" -d '{"aspect_type":"create","event_time":1701311121,"object_id":10303000184,"object_type":"activity","owner_id":912283,"subscription_id":252627,"updates":{}}' https://stravatimeshift.ngrok.app/strava/webhook
export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json();
  const webhook = webhookSchema.parse(body);
  if (webhook.aspect_type !== "create") {
    return new Response("", {
      status: 200,
    });
  }
  console.log("received webhook", webhook);

  // get user by owner_id aka strava athlete id
  const user = await getUserByStravaAthleteID(webhook.owner_id);
  if (!user) {
    return new Response("", {
      status: 200,
    });
  }

  // refresh the user's token
  const refreshTokenResponse = refreshTokenResponseSchema.parse(
    (
      await axios.post("https://www.strava.com/api/v3/oauth/token", {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        refresh_token: user.stravaRefreshToken,
        grant_type: "refresh_token",
      })
    ).data,
  );
  const { access_token, refresh_token } = refreshTokenResponse;
  await updateUserStravaTokens(user.id, access_token, refresh_token);
  console.log("got new token", access_token);

  const headers = {
    Authorization: `Bearer ${access_token}`,
  };

  // get the activity from https://www.strava.com/api/v3/activities/{id}
  let activityResponse = null;
  try {
    activityResponse = await axios.get(
      `https://www.strava.com/api/v3/activities/${webhook.object_id}`,
      { headers },
    );
  } catch (e: unknown) {
    if (e instanceof AxiosError) {
      if (e.response && e.response.status === 404) {
        // user must have deleted the activity and/or it's a stale webhook
        return new Response("", {
          status: 200,
        });
      }
    }
    throw e;
  }
  const activity = activitySchema.parse(activityResponse.data);

  // TODO: make these configurable by the user
  const lowerBound = { hour: 9, minute: 0 };
  const upperBound = { hour: 17, minute: 0 };
  const startTimeLocal = new Date(activity.start_date_local);
  if (!isBetweenTimeBounds(startTimeLocal, lowerBound, upperBound)) {
    console.log("not between time bounds, skipping");
    return new Response("", {
      status: 200,
    });
  }

  const elapsedTimeInSeconds = activity.elapsed_time;
  const endTimeLocal = new Date(
    startTimeLocal.getTime() + elapsedTimeInSeconds * 1000,
  );
  console.log("start and end time:\t", startTimeLocal, endTimeLocal);
  // pick a new end time that is a random time between (lowerBound-10 minutes) and (upperBound-1 minutes)
  const lowerBoundMinusTenMinutes = setMinutes(
    setHours(startTimeLocal, lowerBound.hour),
    lowerBound.minute - 10,
  );
  const lowerBoundMinusOneMinute = setMinutes(
    setHours(startTimeLocal, lowerBound.hour),
    lowerBound.minute - 1,
  );
  const newEndTimeLocal = new Date(
    lowerBoundMinusTenMinutes.getTime() +
      Math.random() *
        (lowerBoundMinusOneMinute.getTime() -
          lowerBoundMinusTenMinutes.getTime()),
  );
  // new start time subtracts elapsed_time (a string in seconds) from newEndTimeLocal
  const newStartTimeLocal = new Date(
    newEndTimeLocal.getTime() - elapsedTimeInSeconds * 1000,
  );
  const adjustmentInSeconds = getDifferenceInSeconds(
    newStartTimeLocal,
    startTimeLocal,
  );

  console.log("new start and end time:\t", newStartTimeLocal, newEndTimeLocal);

  // get all activity streams https://www.strava.com/api/v3/activities/10303000184/streams\?keys=latlng,altitude,cadence,distance,heartrate,moving,watts,temp,time
  const streams = organizeStreamData(
    getActivityStreamsResponseSchema.parse(
      (
        await axios.get(
          `https://www.strava.com/api/v3/activities/${webhook.object_id}/streams`,
          {
            headers,
            params: {
              keys: "latlng,altitude,cadence,distance,heartrate,moving,watts,temp,time",
            },
          },
        )
      ).data,
    ),
  );

  // TODO: invariants about the length and resolution of the streams

  // start writing a file for the new activity data
  let file = "";
  file += `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.garmin.com/xmlschemas/GpxExtensions/v3 http://www.garmin.com/xmlschemas/GpxExtensionsv3.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3">
 <metadata>
  <time>${activity.start_date}</time>
 </metadata>
 <trk>
  <name>${activity.name}</name>
  <type>${activity.type === "Ride" ? "cycling" : activity.type}</type>
  <trkseg>
`;
  const start_date = addSeconds(
    new Date(activity.start_date),
    adjustmentInSeconds,
  );
  for (let i = 0; i < streams.latlng.length; i++) {
    /*
    construct a gpx block like this:
  <trkpt lat="-11.6685090" lon="166.9426300">
    <ele>100.2</ele>
    <time>2023-11-29T19:39:37Z</time>
    <extensions>
     <power>116</power>
     <gpxtpx:TrackPointExtension>
      <gpxtpx:atemp>16</gpxtpx:atemp>
      <gpxtpx:hr>96</gpxtpx:hr>
      <gpxtpx:cad>46</gpxtpx:cad>
     </gpxtpx:TrackPointExtension>
    </extensions>
   </trkpt>
   */
    const ele = streams.altitude?.[i];
    const time = formatDate(addSeconds(start_date, streams.time[i]));
    const power = streams.power?.[i];
    const temp = streams.temp?.[i];
    const hr = streams.heartrate?.[i];
    const cad = streams.cadence?.[i];
    file += `   <trkpt lat="${streams.latlng[i][0].toFixed(
      7,
    )}" lon="${streams.latlng[i][1].toFixed(7)}">\n`;
    if (ele != null) {
      file += `    <ele>${ele.toFixed(1)}</ele>\n`;
    }
    file += `    <time>${time}</time>\n`;
    file += `    <extensions>\n`;
    if (power != null) {
      file += `     <power>${power}</power>\n`;
    }
    file += `     <gpxtpx:TrackPointExtension>\n`;
    if (temp != null) {
      file += `      <gpxtpx:atemp>${temp}</gpxtpx:atemp>\n`;
    }
    if (hr != null) {
      file += `      <gpxtpx:hr>${hr}</gpxtpx:hr>\n`;
    }
    if (cad != null) {
      file += `      <gpxtpx:cad>${cad}</gpxtpx:cad>\n`;
    }
    file += `     </gpxtpx:TrackPointExtension>\n`;
    file += `    </extensions>\n`;
    file += `   </trkpt>\n`;
  }
  file += `  </trkseg>
 </trk>
</gpx>\n`;

  // perform the upload to strava
  const form = new FormData();
  form.append("file", file, {
    filename: `${activity.id}-stravatimeshift.gpx`,
    contentType: "application/gpx+xml",
  });
  form.append("name", activity.name);
  if (activity.description) {
    form.append("description", activity.description);
  }
  form.append("commute", activity.commute ? "true" : "false");
  form.append("trainer", activity.trainer ? "true" : "false");
  form.append("data_type", "gpx");
  const uploadResponse = uploadResponseSchema.parse(
    (
      await axios.post("https://www.strava.com/api/v3/uploads", form, {
        headers: {
          ...headers,
          ...form.getHeaders(),
        },
      })
    ).data,
  );

  console.log("upload response", uploadResponse);

  // return a 200 immediately but continue performing some logic
  setTimeout(async () => {
    // poll every 5 seconds until the upload is complete
    let uploadStatus = uploadResponse.status;
    let activityID = uploadResponse.activity_id;
    while (uploadStatus !== "Your activity is ready.") {
      console.log("waiting for upload to complete");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const uploadStatusResponse = uploadResponseSchema.parse(
        (
          await axios.get(
            `https://www.strava.com/api/v3/uploads/${uploadResponse.id}`,
            {
              headers,
            },
          )
        ).data,
      );
      uploadStatus = uploadStatusResponse.status;
      activityID = uploadStatusResponse.activity_id;
    }

    console.log(
      "upload complete",
      `https://www.strava.com/activities/${activityID}`,
    );
    if (!user.email) {
      console.log("no email, skipping");
      return;
    }
    const loops = new LoopsClient(process.env.LOOPS_API_KEY!);
    await loops.createContact(user.email, {
      firstName: user.firstName,
      lastName: user.lastName,
      subscribed: true,
      userId: user.id,
    });
    const dataVariables = {
      firstName: user.firstName,
      lastName: user.lastName,
      newActivityURL: `https://www.strava.com/activities/${activityID}`,
      oldActivityURL: `https://www.strava.com/activities/${activity.id}`,
    };
    const resp = await loops.sendTransactionalEmail(
      process.env.LOOPS_RIDE_UPLOADED_ID!,
      user.email,
      dataVariables,
    );
    console.log("sent email", resp);
  }, 100);
  return new Response("", {
    status: 200,
  });
}
