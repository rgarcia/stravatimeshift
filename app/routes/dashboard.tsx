import { zodResolver } from "@hookform/resolvers/zod";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { useRemixForm, getValidatedFormData } from "remix-hook-form";
import invariant from "tiny-invariant";
import { z } from "zod";

import { updateUserEmail } from "~/models/user.server";
import { requireUser } from "~/session.server";
import IconOctocat from "~/ui/IconOctocat";

const Settings = z.object({
  email: z.string().email().min(1),
});

type Settings = z.infer<typeof Settings>;

const resolver = zodResolver(Settings);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await requireUser(request);
  return json({ user });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const {
    errors,
    data,
    receivedValues: defaultValues,
  } = await getValidatedFormData<Settings>(request, resolver);
  if (errors) {
    // The keys "errors" and "defaultValue" are picked up automatically by useRemixForm
    return json({ errors, defaultValues });
  }
  invariant(data, "data should be defined");

  const user = await requireUser(request);
  await updateUserEmail(user.id, data.email);
  return redirect("/dashboard");
};

export default function Dashboard() {
  const { user } = useLoaderData<typeof loader>();
  const {
    handleSubmit,
    formState: { errors },
    register,
  } = useRemixForm<Settings>({
    mode: "onSubmit",
    resolver,
  });

  return (
    <section className="w-full h-full bg-gradient-to-r from-gray-900 to-gray-700 text-white">
      <header className="flex justify-between items-center px-6 py-4">
        <Link className="text-2xl font-bold text-orange-500" to="/">
          Strava Time Shift
        </Link>
        <nav className="flex gap-4">
          <form method="post" action="/logout">
            <button>
              <span className="text-lg text-orange-500 cursor-pointer">
                Log out
              </span>
            </button>
          </form>
        </nav>
      </header>
      <main className="flex flex-col items-center justify-center gap-6 px-6 py-16">
        <h1 className="text-4xl font-bold max-w-lg">{`Welcome, ${user.firstName}!`}</h1>
        {user.email ? (
          <p className="text-2xl max-w-lg">
            {`Your email address is ${user.email}. You can change it below`}
          </p>
        ) : (
          <p className="text-2xl max-w-lg text-justify">
            {
              "There's one more thing to set up. In order to receive a link to the original and new activity, we need your email address. Please enter it below."
            }
          </p>
        )}
        <>
          <Form
            onSubmit={handleSubmit}
            method="post"
            className="w-full max-w-lg text-gray-300"
          >
            <div className="flex flex-col space-y-4">
              <input
                className="px-4 py-2 rounded bg-gray-800 text-white placeholder-gray-500"
                {...register("email")}
                // ref={emailRef}
                // id="email"
                placeholder="Email"
                // // eslint-disable-next-line jsx-a11y/no-autofocus
                // autoFocus={true}
                // required
                // name="email"
                // type="email"
                // autoComplete="Email"
                // aria-invalid={actionData?.errors?.email ? true : undefined}
                // aria-describedby="email-error"
              />
              {errors.email?.message ? (
                <div className="pt-1 text-red-700" id="email-error">
                  {errors.email.message}
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
