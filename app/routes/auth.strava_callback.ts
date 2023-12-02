import { LoaderFunctionArgs } from "@remix-run/node";
import axios from "axios";
import { z } from "zod";

import { createUser, getUserByStravaAthleteID } from "~/models/user.server";
import { createUserSession } from "~/session.server";

const athleteSchema = z.object({
  id: z.number(),
  firstname: z.string(),
  lastname: z.string(),
});

const tokenSchema = z.object({
  token_type: z.literal("Bearer"),
  expires_at: z.number(),
  expires_in: z.number(),
  refresh_token: z.string(),
  access_token: z.string(),
  athlete: athleteSchema,
});

export async function loader({ request }: LoaderFunctionArgs) {
  // handle the callback after a user logs in with strava, e.g.
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const scope = url.searchParams.get("scope");
  if (scope !== "read,activity:write,activity:read_all") {
    return new Response(
      "Must authorize read, activity:write, and activity:read_all",
      {
        status: 400,
      },
    );
  }
  const response = await axios.post(
    "https://www.strava.com/api/v3/oauth/token",
    {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    },
  );

  const token = tokenSchema.parse(response.data);

  const existingUser = await getUserByStravaAthleteID(token.athlete.id);
  if (existingUser) {
    return createUserSession({
      redirectTo: "/dashboard",
      remember: false,
      request,
      userId: existingUser.id,
    });
  }

  const user = await createUser(
    token.athlete.firstname,
    token.athlete.lastname,
    token.athlete.id,
    token.access_token,
    token.refresh_token,
  );

  return createUserSession({
    redirectTo: "/dashboard",
    remember: false,
    request,
    userId: user.id,
  });
}
