import React from 'react';
import useDocumentMeta from '../hooks/useDocumentMeta';
import '../Style/Cv.scss';

export default function Cv() {
  useDocumentMeta({
    title: 'CV — François Vittecoq, dev & orchestrateur IA',
    description:
      "CV de François Vittecoq, développeur web et orchestrateur IA. Alternant dev IA et formateur Claude Code chez LundiMatin (Montpellier). Téléchargement PDF.",
    canonical: 'https://francoisv34.github.io/P8--Portfolio-Dev/cv',
  });

  return (
    <>
      <section className="cv">
        <h1>CV — François Vittecoq, dev &amp; orchestrateur IA</h1>
        <p>
          Vous pouvez consulter mon CV ci-dessous ou le télécharger en PDF :
        </p>
        <iframe
          src={`${process.env.PUBLIC_URL}/CVVittecoq.pdf`}
          title="CV de François Vittecoq"
          style={{
            width: '100%',
            height: '800px',
            border: 'none',
          }}
        ></iframe>
        <div style={{ marginTop: '1rem' }} className="download-div">
          <a
            href={`${process.env.PUBLIC_URL}/CVVittecoq.pdf`}
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
