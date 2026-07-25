import PlayerPage from "./PlayerPage";

export default function Page({ params }) {
  return <PlayerPage id={params.id} />;
}
