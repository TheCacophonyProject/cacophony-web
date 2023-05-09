export const selectedProjectDevices = Symbol("selected project devices");

export const userProjects = Symbol("projects for current user");

export const userHasProjects = Symbol(
  "current user belongs to one or more projects"
);
export const currentSelectedProject = Symbol(
  "currently selected project (if any)"
);
export const urlNormalisedCurrentSelectedProjectName = Symbol(
  "url normalised version of selected project name"
);

export const currentUserCreds = Symbol("credentials for current user");

export const currentUser = Symbol("current user login details");
export const userIsProjectAdmin = Symbol(
  "current user is admin of selected project"
);

export const activeLocations = Symbol(
  "locations with active devices in the current time window"
);

export const allHistoricLocations = Symbol(
  "all known locations for this project"
);
export const latLngForActiveLocations = Symbol(
  "a single canonical lat/lng to represent all active devices in the current time window used for timezone sunrise/sunset calcs"
);

export const userIsLoggedIn = Symbol("there is a logged in user");
