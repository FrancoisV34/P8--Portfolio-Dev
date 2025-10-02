import competences from '../Data/Competences.json';

export default function Competences() {
  return (
    <>
      {competences.map((competence) => (
        <section className="competences">
          <h3 className="comp-title">Mes compétences</h3>
          <div className="competences-list">
            <ul>
              <li>
                <div className="competence">
                  <img
                    className="comp-logo"
                    src={competence.logo}
                    alt={competence.nom}
                  ></img>
                  <div className="competence-level">
                    <div className="level-bar">
                      <span className="name">{competence.nom}</span>
                      <span className="level">{competence.niveau}</span>
                    </div>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </section>
      ))}
    </>
  );
}
