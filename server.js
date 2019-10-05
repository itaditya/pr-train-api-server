require('dotenv').config();
const { URLSearchParams } = require('url');
const fetch = require('node-fetch');
const polka = require('polka');
const cors = require('cors');

const { PORT = 9999, GITHUB_TOKEN, GITHUB_ORG } = process.env;

function error(errorData) {
  console.error(`Error [${errorData.id}]:`, errorData.message);
  const error = JSON.stringify(errorData);
  throw new Error(error);
}

function filterRecentPR(pr) {
  const dPR = new Date(pr.updated_at);
  const dMachine = new Date();

  const isDifferentYear = dPR.getUTCFullYear() !== dMachine.getUTCFullYear();
  const isOlderThanOneMonth = dMachine.getUTCMonth() - dPR.getUTCMonth() > 1;

  if (isDifferentYear) {
    return false;
  }

  if (isOlderThanOneMonth) {
    return false;
  }

  return true;
}

function mapPRData(pr) {
  const dPR = new Date(pr.updated_at);
  const dMachine = new Date();

  const repoUrl = pr.repository_url;
  const lastSlashIndex = repoUrl.lastIndexOf('/');
  const repo = repoUrl.substring(lastSlashIndex + 1);

  const secPRAge = (dMachine.getTime() - dPR.getTime()) / 1000;

  const data = {
    id: pr.id,
    title: pr.title,
    author: pr.user.login,
    link: pr.html_url,
    number: pr.number,
    repo,
    secPRAge,
  };

  return data;
}

async function getTeamMembers(team) {
  const url = `https://api.github.com/orgs/${GITHUB_ORG}/teams/${team}`;
  const apiRes = await fetch(url, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
    },
  });
  const apiData = await apiRes.json();
  const teamId = apiData.id;

  if (!teamId) {
    error({
      message: 'Invalid Team Id',
      id: 'team-slug:invalid',
    });
  }

  const membersUrl = `https://api.github.com/teams/${teamId}/members`;

  return fetch(membersUrl, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
    },
  });
}

async function getTeams() {
  const url = `https://api.github.com/orgs/${GITHUB_ORG}/teams`;
  return fetch(url, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
    },
  });
}

async function getReviewerData(reviewer) {
  const searchQuery = `q=is:open+is:pr+org:${GITHUB_ORG}+review-requested:${reviewer}`;
  const params = new URLSearchParams({
    sort: 'created',
    order: 'desc',
  });
  const otherQueries = params.toString();
  const url = `https://api.github.com/search/issues?${searchQuery}&${otherQueries}`;

  const apiRes = await fetch(url, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
    },
  });
  return new Promise(resolve => {
    apiRes.json().then(apiData => {
      resolve({
        reviewer,
        data: cleanseData(apiData.items),
      });
    });
  });
}

function cleanseData(prList) {
  const assignedPR = prList.filter(filterRecentPR).map(mapPRData);
  return assignedPR;
}

polka()
  .use(cors())
  .get('/api/teams', async (req, res) => {
    try {
      const teamsRes = await getTeams();
      const teamsData = await teamsRes.json();
      const teamsList = teamsData.map(team => ({ name: team.name, slug: team.slug }));
      res.end(JSON.stringify({ teamsList }));
    } catch (error) {
      res.statusCode = 403;
      res.end(error.message);
    }
  })
  .get('/api/reviewers', async (req, res) => {
    const { team = '' } = req.query;

    try {
      if (team.length === 0) {
        error({
          message: 'Please provide a team slug',
          id: 'team-slug:absent',
        });
      }
      const reviewerRes = await getTeamMembers(team);
      const reviewerData = await reviewerRes.json();
      const reviewersList = reviewerData.map(reviewer => reviewer.login);

      const promiseList = reviewersList.map(reviewer => getReviewerData(reviewer));
      const data = await Promise.all(promiseList);

      const assignedPR = {};
      data.forEach(d => {
        assignedPR[d.reviewer] = d.data;
      });

      res.end(JSON.stringify({ reviewersList, assignedPR }));
    } catch (error) {
      res.statusCode = 403;
      res.end(error.message);
    }
  })
  .get('/api/pendingPRCount', async (req, res) => {
    const { reviewers = '' } = req.query;
    try {
      if (reviewers.length === 0) {
        error({
          message: 'Please provide a comma separated list of reviewers',
          id: 'reviewers-list:absent',
        });
      }

      const reviewersList = reviewers.split(',');
      console.log('reviewers', reviewersList);
      const promiseList = reviewersList.map(reviewer => getReviewerData(reviewer));
      const data = await Promise.all(promiseList);

      const assignedPR = {};
      data.forEach(d => {
        assignedPR[d.reviewer] = d.data.length;
      });

      res.end(JSON.stringify({ assignedPR }));
    } catch (error) {
      res.statusCode = 403;
      res.end(error.message);
    }
  })
  .listen(PORT, err => {
    if (err) throw err;
    console.log(`> Running on localhost:9999`);
  });
