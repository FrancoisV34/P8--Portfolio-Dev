import competences from '../Data/Competences.json';
import '../Style/Competences.scss';

export default function Competences() {
  return (
    <>
      <ul>
        {competences.map((competence, index) => (
          <li key={index}>
            <div className="competence">
              <img
                className="comp-logo"
                src={competence.logo}
                alt={competence.nom}
              ></img>
              <div className="competence-level">
                <div
                  className="level-bar"
                  style={{
                    width: competence.niveau,
                    backgroundColor: competence.color,
                  }}
                >
                  <span className="nameandlevel">
                    {competence.nom} : {competence.niveau}
                  </span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
