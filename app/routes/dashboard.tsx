import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { useEffect, useRef } from "react";

import { updateUserEmail } from "~/models/user.server";
import { requireUser } from "~/session.server";
import IconOctocat from "~/ui/IconOctocat";
import { validateEmail } from "~/utils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await requireUser(request);
  return json({ user });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const email = formData.get("email");
  if (!validateEmail(email)) {
    return json(
      {
        errors: {
          email: "Email is invalid",
        },
      },
      { status: 400 },
    );
  }

  const user = await requireUser(request);
  await updateUserEmail(user.id, email);
  return redirect("/dashboard");
};

export default function Dashboard() {
  const { user } = useLoaderData<typeof loader>();

  const actionData = useActionData<typeof action>();
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (actionData?.errors?.email) {
      emailRef.current?.focus();
    }
  }, [actionData]);

  return (
    <section className="w-full h-screen bg-gradient-to-r from-gray-900 to-gray-700 text-white">
      <header className="flex justify-between items-center px-6 py-4">
        <Link className="text-2xl font-bold text-orange-500" to="/">
          Strava Time Shift
        </Link>
        <nav className="flex gap-4">
          <Link className="text-lg text-orange-500" to="/logout">
            Log out
          </Link>
        </nav>
      </header>
      <main className="flex flex-col items-center justify-center gap-6 px-6 py-16">
        <h1 className="text-4xl font-bold max-w-lg">{`Welcome, ${user.firstName}!`}</h1>
        {user.email ? (
          <p className="text-2xl max-w-lg">
            {`Your email address is ${user.email}. If you'd like to change it, please `}
            <a className="text-orange-500" href="mailto:rgarcia2009@gmail.com">
              contact me
            </a>
            {`.`}
          </p>
        ) : (
          <>
            <p className="text-2xl max-w-lg text-justify">
              {
                "There's one more thing to set up. In order to receive a link to the original and new activity, we need your email address. Please enter it below."
              }
            </p>
            <Form method="POST" className="w-full max-w-lg text-gray-300">
              <div className="flex flex-col space-y-4">
                <input
                  className="px-4 py-2 rounded bg-gray-800 text-white placeholder-gray-500"
                  ref={emailRef}
                  id="email"
                  placeholder="Email"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus={true}
                  required
                  name="email"
                  type="email"
                  autoComplete="Email"
                  aria-invalid={actionData?.errors?.email ? true : undefined}
                  aria-describedby="email-error"
                />
                {actionData?.errors?.email ? (
                  <div className="pt-1 text-red-700" id="email-error">
                    {actionData.errors.email}
                  </div>
                ) : null}
                <button
                  className="bg-orange-500 text-white px-8 py-4 rounded shadow hover:bg-orange-600"
                  type="submit"
                >
                  Set email
                </button>
              </div>
            </Form>
          </>
        )}
      </main>
      <footer className="flex justify-center items-center px-6 py-4">
        <p className="text-sm text-gray-500">Built with ♥ by Rafael Garcia</p>
        <Link to="https://github.com/rgarcia" className="ml-2">
          <IconOctocat className="text-orange-500 h-6 w-6" />
        </Link>
      </footer>
    </section>
  );
}
