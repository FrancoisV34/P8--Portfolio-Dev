import React from 'react';
import '../Style/Cv.scss';

export default function Cv() {
  return (
    <>
      <section className="cv">
        <h1>Mon CV</h1>
        <p>
          Vous pouvez consulter mon CV ci-dessous ou le télécharger en PDF :
        </p>
        <iframe
          src={`${process.env.PUBLIC_URL}/Vittecoq.pdf`}
          title="CV de François Vittecoq"
          style={{
            width: '100%',
            height: '800px',
            border: 'none',
          }}
        ></iframe>
        <div style={{ marginTop: '1rem' }} className="download-div">
          <a
            href={`${process.env.PUBLIC_URL}/Vittecoq.pdf`}
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
