import React, { useState } from 'react';
import '../Style/ProjectButton.scss';

export default function Button({ project }) {
  const [open, setOpen] = useState(false);

  const handleClick = () => {
    setOpen(!open);
  };

  return (
    <>
      <React.Fragment key={project.id}>
        <button className="button-description" onClick={handleClick}>
          {project.title} <i className="fleche"></i>
        </button>
        <div className={`description ${open ? 'open' : ''}`}>
          <p>{project.description}</p>
        </div>
      </React.Fragment>
    </>
  );
}
