import { OnboardingView } from "./_components/OnboardingView";

/* Route: /repos/:repoId/onboarding (Onboarding Tour). Thin route entry — the
   view, its header, banners and readiness notice are colocated under
   _components/; the five tour sections live in _components/TourSections. */
export default function OnboardingTourPage() {
  return <OnboardingView />;
}
