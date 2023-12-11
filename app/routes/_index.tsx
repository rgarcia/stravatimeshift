import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useNavigate } from "@remix-run/react";

import IconOctocat from "~/ui/IconOctocat";
import { useOptionalUser } from "~/utils";

export const meta: MetaFunction = () => [
  {
    title: "Strava Time Shift",
  },
  {
    name: "description",
    content:
      "Automatically change the time of your weekday Strava activities to be outside of work hours.",
  },
];

// loader that redirects apex to www, constructs strava auth url
export function loader({ request }: LoaderFunctionArgs) {
  if (
    process.env.NODE_ENV === "production" &&
    request.headers.get("host")?.endsWith(".com")
  ) {
    const receivedHost: string = request.headers.get("host") ?? "";
    const canonicalHost: string =
      process.env.FLY_APP_NAME === "stravatimeshift"
        ? "www.stravatimeshift.com"
        : "staging.stravatimeshift.com";
    if (receivedHost !== canonicalHost) {
      return new Response(null, {
        status: 301,
        headers: {
          Location: "https://" + canonicalHost,
        },
      });
    }
  }

  const client_id = process.env.STRAVA_CLIENT_ID;
  const redirect_uri = process.env.STRAVA_REDIRECT_URI;
  const response_type = "code";
  const scope = "activity:read_all,activity:write";
  const state = "index";
  return {
    stravaAuthURL: `https://www.strava.com/oauth/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=${response_type}&scope=${scope}&state=${state}`,
  };
}

export default function Index() {
  const loaderData = useLoaderData<typeof loader>();
  const user = useOptionalUser();
  const navigate = useNavigate();

  return (
    <section className="w-full h-screen bg-gradient-to-r from-gray-900 to-gray-700 text-white">
      <header className="flex justify-between items-center px-6 py-4">
        <a className="text-2xl font-bold text-orange-500" href="/">
          Strava Time Shift
        </a>
        <nav className="flex gap-4">
          {user ? (
            <>
              <Link className="text-lg text-orange-500" to="/dashboard">
                Dashboard
              </Link>
              <Link className="text-lg text-orange-500" to="/logout">
                Log out
              </Link>
            </>
          ) : null}
        </nav>
      </header>
      <main className="flex flex-col items-center justify-center gap-6 px-6 py-16">
        <h1 className="text-5xl font-bold max-w-lg text-center">
          Automagically change the time of your Strava activities.
        </h1>
        <p className="text-xl text-gray-300 max-w-lg text-center">
          Your boss will never know.
        </p>
        {user ? (
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center justify-center text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 bg-orange-500 text-white px-8 py-4 rounded shadow hover:bg-orange-600"
          >
            Dashboard
          </button>
        ) : (
          <Link to={loaderData.stravaAuthURL}>
            <img
              src="/btn_strava_connectwith_orange@2x.png"
              alt="Connect with Strava"
            />
          </Link>
          // <button
          //   onClick={() => navigate("/join")}
          //   className="inline-flex items-center justify-center text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 bg-orange-500 text-white px-8 py-4 rounded shadow hover:bg-orange-600"
          // >
          //   Get Started
          // </button>
        )}
      </main>
      <section className="flex flex-col items-center justify-center gap-6 px-6 py-16">
        <h2 className="text-3xl font-bold max-w-lg text-center">
          How It Works
        </h2>
        <div className="flex flex-col items-center gap-6 text-xl text-gray-300 max-w-lg text-center">
          <p>Upload an activity during the workday</p>
          <IconArrowdown className="text-orange-500 h-6 w-6" />
          <p>
            Strava Time Shift gets notified and re-uploads the activity with a
            new time that has it ending before the start of the workday
          </p>
          <IconArrowdown className="text-orange-500 h-6 w-6" />
          <p>Receive an email with a link to the new activity</p>
        </div>
      </section>
      <footer className="flex justify-center items-center px-6 py-4">
        <p className="text-sm text-gray-500">Built with ♥ by Rafael Garcia</p>
        <Link to="https://github.com/rgarcia" className="ml-2">
          <IconOctocat className="text-orange-500 h-6 w-6" />
        </Link>
      </footer>
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function IconArrowdown(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  );
}
