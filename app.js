const express = require("express");
const app = express();

const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;

app.use(express.json());

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen("9000", () => {
      console.log("*** Server is running at http://localhost:9000/ ***");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const convertDbObjectToStateDetails = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDbObjectToDistrictDetails = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

const convertDbObjectToStateDiseaseDetails = (dbObject) => {
  return {
    totalCases: dbObject.total_cases,
    totalCured: dbObject.total_cured,
    totalActive: dbObject.total_active,
    totalDeaths: dbObject.total_deaths,
  };
};

//MiddleWare Function - User Authentication
const authentication = async (request, response, next) => {
  let jwtToken;
  const authorizer = request.headers["authorization"];
  if (authorizer !== undefined) {
    jwtToken = authorizer.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECret", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

//API 1

app.post("/login/", async (request, response) => {
  const userDetails = request.body;
  const { username, password } = userDetails;
  const userVerificationQuery = `
  SELECT
    *
  FROM
    user
  WHERE
    username = '${username}';`;
  const dbUser = await db.get(userVerificationQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatch) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "SECret");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// Get States Details - API 2

app.get("/states/", authentication, async (request, response) => {
  const stateDetailsQuery = `
    SELECT
      *  
    FROM
        state;`;
  const stateDetails = await db.all(stateDetailsQuery);
  response.send(
    stateDetails.map((eachState) => convertDbObjectToStateDetails(eachState))
  );
});

// Get a State Details by ID - API 3

app.get("/states/:stateId/", authentication, async (request, response) => {
  const { stateId } = request.params;
  const stateIdQuery = `
    SELECT
      *
    FROM
        state
    WHERE
        state_id = ${stateId};`;
  const stateDetails = await db.get(stateIdQuery);
  response.send(convertDbObjectToStateDetails(stateDetails));
});

//Add a District - API 4

app.post("/districts/", authentication, async (request, response) => {
  const districtDetails = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;
  const addDistrictQuery = `
    INSERT INTO
        district (district_name, state_id, cases, cured, active, deaths)
    VALUES(
        '${districtName}',
        ${stateId},
        ${cases},
        ${cured},
        ${active},
        ${deaths}
    );`;
  await db.run(addDistrictQuery);
  response.send("District Successfully Added");
});

//Get District Details by Id - API 5

app.get(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const districtIdQuery = `
    SELECT
    *
    FROM
        district
    WHERE
        district_id = ${districtId};`;
    const districtDetails = await db.get(districtIdQuery);
    response.send(convertDbObjectToDistrictDetails(districtDetails));
  }
);

//Remove a District - API 6

app.delete(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
    DELETE
    FROM
        district
    WHERE
        district_id = ${districtId};`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

//Update a District - API 7

app.put(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const districtDetails = request.body;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = districtDetails;
    const updateDistrictQuery = `
    UPDATE
        district
    SET
        district_name = '${districtName}',
        state_id = ${stateId},
        cases = ${cases},
        cured = ${cured},
        active = ${active},
        deaths = ${deaths}
    WHERE
        district_id = ${districtId};`;
    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

// Get Stats of a Specific State - API 8

app.get(
  "/states/:stateId/stats/",
  authentication,
  async (request, response) => {
    const { stateId } = request.params;
    const statsOfAStateQuery = `
    SELECT
        SUM(cases) AS total_cases,
        SUM(cured) AS total_cured,
        SUM(active) AS total_active,
        SUM(deaths) AS total_deaths
    FROM
        district NATURAL JOIN state
    WHERE
        state_id = ${stateId};`;
    const stateStats = await db.get(statsOfAStateQuery);
    response.send(convertDbObjectToStateDiseaseDetails(stateStats));
  }
);

module.exports = app;
