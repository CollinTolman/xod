import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { resolve } from 'path';
import fs from 'fs';
import { doesFileExist, doesDirectoryExist, rmrf } from 'xod-fs';
import { getProjectName } from 'xod-project';

import * as WA from '../src/app/workspaceActions';
import * as ERROR_CODES from '../src/shared/errorCodes';
import * as EVENTS from '../src/shared/events';

chai.use(chaiAsPromised);

const fixture = path => resolve(__dirname, './fixtures', path);

const expectRejectedWithCode = (promise, errorCode) => expect(promise)
  .to.eventually.be.rejected
  .and.have.property('errorCode', errorCode);

describe('Utils', () => {
  afterEach(() => rmrf(fixture('./notExistWorkspace')));

  describe('resolveWorkspacePath', () => {
    it('resolves Path for valid value',
      () => assert.eventually.equal(
        WA.resolveWorkspacePath(fixture('./validWorkspace')),
        fixture('./validWorkspace')
      )
    );
    it('rejects INVALID_WORKSPACE_PATH for null value',
      () => expectRejectedWithCode(
        WA.resolveWorkspacePath(null),
        ERROR_CODES.INVALID_WORKSPACE_PATH
      )
    );
    it('rejects INVALID_WORKSPACE_PATH for empty string',
      () => expectRejectedWithCode(
        WA.resolveWorkspacePath(''),
        ERROR_CODES.INVALID_WORKSPACE_PATH
      )
    );
  });

  describe('isWorkspaceValid', () => {
    it('resolves Path for valid workspace',
      () => assert.eventually.equal(
        WA.isWorkspaceValid(fixture('./validWorkspace')),
        fixture('./validWorkspace')
      )
    );
    it('rejects WORKSPACE_DIR_NOT_EMPTY for empty workspace',
      () => expectRejectedWithCode(
        WA.isWorkspaceValid(fixture('./emptyWorkspace')),
        ERROR_CODES.WORKSPACE_DIR_NOT_EMPTY
      )
    );
    it('rejects WORKSPACE_DIR_NOT_EXIST_OR_EMPTY for non-existent directory',
      () => expectRejectedWithCode(
        WA.isWorkspaceValid(fixture('./notExistWorkspace')),
        ERROR_CODES.WORKSPACE_DIR_NOT_EXIST_OR_EMPTY
      )
    );
  });

  describe('validateWorkspace', () => {
    it('resolves Path for valid workspace',
      () => assert.eventually.equal(
        WA.validateWorkspace(fixture('./validWorkspace')),
        fixture('./validWorkspace')
      )
    );
    it('rejects WORKSPACE_DIR_NOT_EXIST_OR_EMPTY for not existent directory',
      () => expectRejectedWithCode(
        WA.validateWorkspace(fixture('./notExistWorkspace')),
        ERROR_CODES.WORKSPACE_DIR_NOT_EXIST_OR_EMPTY
      )
    );
    it('rejects WORKSPACE_DIR_NOT_EMPTY for not empty directory without workspace file',
      () => expectRejectedWithCode(
        WA.validateWorkspace(fixture('.')),
        ERROR_CODES.WORKSPACE_DIR_NOT_EMPTY
      )
    );
  });

  describe('spawnWorkspaceFile', () => {
    it('resolves Path for successfull spawning',
      () => WA.spawnWorkspaceFile(fixture('./notExistWorkspace'))
        .then((path) => {
          assert.equal(path, fixture('./notExistWorkspace'));
          assert.ok(doesFileExist(fixture('./notExistWorkspace/.xodworkspace')));
        })
    );
  });

  describe('spawnStdLib', () => {
    it('resolves Path for successfull spawnking',
      () => WA.spawnStdLib(fixture('./notExistWorkspace')).then(() => {
        assert.ok(doesDirectoryExist(fixture('./notExistWorkspace/lib')));
        fs.readdir(fixture('./notExistWorkspace/lib'), (err, files) => {
          assert.includeMembers(files, ['xod']);
        });
      })
    );
  });

  describe('spawnDefaultProject', () => {
    it('resolves Path for successfull spawnking',
      () => WA.spawnDefaultProject(fixture('./notExistWorkspace')).then(() => {
        assert.ok(doesDirectoryExist(fixture('./notExistWorkspace/welcome-to-xod')));
        fs.readdir(fixture('./notExistWorkspace/welcome-to-xod'), (err, files) => {
          assert.includeMembers(files, ['project.xod', 'main']);
        });
      })
    );
  });

  describe('enumerateProjects', () => {
    it('resolves ProjectMeta for valid workspace',
      () => assert.eventually.lengthOf(
        WA.enumerateProjects(fixture('./validWorkspace')),
        1
      )
    );
    it('rejects Error CANT_ENUMERATE_PROJECTS for non-existent workspace',
      () => expectRejectedWithCode(
        WA.enumerateProjects(fixture('./notExistWorkspace')),
        ERROR_CODES.CANT_ENUMERATE_PROJECTS
      )
    );
  });
});

describe('IDE', () => {
  const deleteTestFiles = () => Promise.all([
    rmrf(fixture('./notExistWorkspace')),
    rmrf(fixture('./emptyWorkspace/welcome-to-xod')),
    rmrf(fixture('./emptyWorkspace/lib')),
  ]);
  afterEach(deleteTestFiles);

  const loadMock = path => () => Promise.resolve(path);
  const saveMock = expectedPath => (actualPath) => {
    assert.equal(expectedPath, actualPath);
    return actualPath;
  };
  const sendMockDefault = (eventName, data) => {
    assert.oneOf(eventName, [
      EVENTS.UPDATE_WORKSPACE,
      EVENTS.REQUEST_SELECT_PROJECT,
    ]);
    if (eventName === EVENTS.REQUEST_SELECT_PROJECT) {
      assert.equal(data[0].name, 'welcome-to-xod');
    }
  };
  const subscribeOnSelectProject = (done, path, projectName) => WA.WorkspaceEvents.once(
    EVENTS.SELECT_PROJECT,
    ({ projectMeta }) => {
      WA.onSelectProject(
        (eventName, project) => {
          assert.equal(eventName, EVENTS.REQUEST_SHOW_PROJECT);
          assert.equal(getProjectName(project), projectName);
        },
        loadMock(path),
        projectMeta
      ).then(() => done());
    }
  );

  describe('could spawn whole workspace', () => {
    it('resolves a list of local projects',
      () => Promise.resolve(fixture('./notExistWorkspace'))
        .then(WA.spawnWorkspaceFile)
        .then(WA.spawnStdLib)
        .then(WA.spawnDefaultProject)
        .then(WA.enumerateProjects)
        .then((projects) => {
          assert.lengthOf(projects, 1);
        })
    );
  });

  describe('when launched', () => {
    it('if workspace valid and has projects, requests User to select project',
      () => WA.onIDELaunch(
        sendMockDefault,
        loadMock(fixture('./validWorkspace')),
        saveMock(fixture('./validWorkspace'))
      )
    );
    it('if workspace does not exist, spawns workspace and default project in homedir, and requests to open it',
      () => WA.onIDELaunch(
        (eventName, { path, force }) => {
          assert.equal(eventName, EVENTS.REQUEST_CREATE_WORKSPACE);
          assert.equal(path, fixture('./notExistWorkspace'));
          assert.isFalse(force);
        },
        loadMock(fixture('./notExistWorkspace')),
        saveMock(fixture('./notExistWorkspace'))
      )
    );
  });

  describe('when User requested to switch workspace', () => {
    it('if workspace valid and has projects, stores path to workspace in settings, requests to select project to open',
      () => WA.onSwitchWorkspace(
        sendMockDefault,
        saveMock(fixture('./validWorkspace')),
        fixture('./validWorkspace')
      )
    );
    it('if workspace does not exist, requests User to confirm creation of new workspace', () => {
      const sendMock = (eventName, { path, force }) => {
        assert.equal(eventName, EVENTS.REQUEST_CREATE_WORKSPACE);
        assert.equal(path, fixture('./notExistWorkspace'));
        assert.isFalse(force);
      };
      return WA.onSwitchWorkspace(sendMock, saveMock(fixture('./notExistWorkspace')), fixture('./notExistWorkspace'));
    });
    it('if choosed folder is not empty, requests User to confirm forced creation of new workspace in this directory', () => {
      const sendMock = (eventName, { path, force }) => {
        assert.equal(eventName, EVENTS.REQUEST_CREATE_WORKSPACE);
        assert.equal(path, fixture('.'));
        assert.isTrue(force);
      };
      return WA.onSwitchWorkspace(sendMock, saveMock(fixture('.')), fixture('.'));
    });
  });

  describe('when User confirms creating of new workspace', () => {
    it('if directory is empty or does not exist, spawns .xodworkspace, stdlib, default project, save path in settings, and requests to open default project', (done) => {
      subscribeOnSelectProject(done, fixture('./notExistWorkspace'), 'welcome-to-xod');

      WA.onCreateWorkspace(
        (eventName) => {
          assert.equal(eventName, EVENTS.UPDATE_WORKSPACE);
        },
        saveMock(fixture('./notExistWorkspace')),
        fixture('./notExistWorkspace')
      );
    });
    it('if directory is workspace without projects, spawns only default project, save path in settings, and requests to open it', (done) => {
      subscribeOnSelectProject(done, fixture('./emptyWorkspace'), 'welcome-to-xod');

      WA.onCreateWorkspace(
        (eventName) => {
          assert.equal(eventName, EVENTS.UPDATE_WORKSPACE);
        },
        saveMock(fixture('./emptyWorkspace')),
        fixture('./emptyWorkspace')
      );
    });
  });

  describe('when User clicked "Open project"', () => {
    it('if workspace valid and has projects, resolves ProjectMeta[] and requests to select project to open',
      () => WA.onOpenProject(sendMockDefault, loadMock(fixture('./validWorkspace')))
    );
    it('if workspace does not exist, shows error and requests to switch workspace', () => {
      const sendMock = (eventName, err) => {
        assert.equal(eventName, EVENTS.WORKSPACE_ERROR);
        assert.equal(err.errorCode, ERROR_CODES.CANT_ENUMERATE_PROJECTS);
      };
      return expectRejectedWithCode(
        WA.onOpenProject(sendMock, loadMock(fixture('./notExistWorkspace'))),
        ERROR_CODES.CANT_ENUMERATE_PROJECTS
      );
    });
    it('if workspace is empty, spawns default project and requests to open it',
      () => WA.onOpenProject(sendMockDefault, loadMock(fixture('./emptyWorkspace')))
    );
  });

  describe('when User selected project to open', () => {
    it('if workspace valid and has selected project: loads project and opens it in renderer', () => {
      const sendMock = (eventName, project) => {
        assert.equal(eventName, EVENTS.REQUEST_SHOW_PROJECT);
        assert.equal(getProjectName(project), 'welcome-to-xod');
      };
      return WA.onSelectProject(
        sendMock,
        loadMock(fixture('./validWorkspace')),
        { path: fixture('./validWorkspace/welcome-to-xod') }
      );
    });
    it('if invalid workspace but valid projectMeta, shows error and requests to switch workspace', () => {
      // it could be happen only if user clicked "Open Project",
      // then clean workspace, and then clicked to open one of project, that was deleted
      const sendMock = (eventName, err) => {
        assert.equal(eventName, EVENTS.WORKSPACE_ERROR);
        assert.equal(err.errorCode, ERROR_CODES.CANT_OPEN_SELECTED_PROJECT);
      };

      return expectRejectedWithCode(
        WA.onSelectProject(
          sendMock,
          loadMock(fixture('./emptyWorkspace')),
          { path: fixture('./emptyWorkspace/welcome-to-xod') }
        ),
        ERROR_CODES.CANT_OPEN_SELECTED_PROJECT
      );
    });
  });

  describe('when User requests to create new project', () => {
    const deleteTestProject = () => rmrf(fixture('./emptyWorkspace/test'));
    afterEach(deleteTestProject);

    it('creates and saves new project, and request to open new project', (done) => {
      subscribeOnSelectProject(done, fixture('./emptyWorkspace'), 'test');
      WA.onCreateProject(
        (eventName) => {
          assert.equal(eventName, EVENTS.SAVE_PROJECT);
        },
        loadMock(fixture('./emptyWorkspace')),
        'test'
      );
    });
  });
});