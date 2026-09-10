import '../Style/Cv.scss';
import type { Route } from './+types/cv';
import { siteOrigin } from '../lib/site.server';
import { publicMeta } from '../lib/public-meta';

export const loader = () => ({ origin: siteOrigin() });
export const meta = ({ loaderData }: Route.MetaArgs) => publicMeta(
  loaderData?.origin ?? '', '/cv',
  'CV — François Vittecoq, dev & orchestrateur IA',
  'CV de François Vittecoq, développeur web et orchestrateur IA. Alternant dev IA et formateur Claude Code chez LundiMatin (Montpellier). Téléchargement PDF.',
);

export default function Cv() {

  return (
    <>
      <section className="cv">
        <h1>CV — François Vittecoq, dev &amp; orchestrateur IA</h1>
        <p>
          Vous pouvez consulter mon CV ci-dessous ou le télécharger en PDF :
        </p>
        <iframe
          src={"/CVVittecoq.pdf"}
          title="CV de François Vittecoq"
          style={{
            width: '100%',
            height: '800px',
            border: 'none',
          }}
        ></iframe>
        <div style={{ marginTop: '1rem' }} className="download-div">
          <a
            href={"/CVVittecoq.pdf"}
            download="CV-Francois-Vittecoq.pdf"
            className="download-link"
          >
            Télécharger le CV en .pdf
          </a>
        </div>
      </section>
    </>
  );
}
