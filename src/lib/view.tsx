import React from 'react';
import dbFn from 'jsonmvc-datastore';
import isEqual from 'lodash/isEqual';

interface GenericState {
  [key: string]: any;
}

/*
type Prop = string | number | null;

interface Args {
  [key: string]: string;
}

interface GenericProp {
  [key: string]: Prop;
}

type ElementFn = (args: Args) => null | JSX.Element;
type Guard = (args: Args | null | void) => boolean | null | void;

interface View {
  state?: string;
  args: Args;
  fn: ElementFn;
  guard?: Guard;
}

function structure(views: View[] | View) {
  if (!views) {
    return;
  }
}
*/

interface Patch {
  op: string;
  path: string;
  value?: any;
}
interface DB {
  get(path: string): any;
  on(path: string, cb: (value: any) => void): () => void;
  patch(patches: Patch[]): void;
}

interface Foo {
  id: string;
  name: string;
}

export interface Schema {
  foos: {
    ids: string[];
    list: {
      [key: string]: Foo;
    };
  };
  chosen?: string;
}

export interface BaseState {
  [key: string]: any;
  hasError?: boolean;
  errorMessage?: string;
}
/*
export type BaseData<T> = {
  [K in keyof T]: T[K];
}
*/
export interface BaseData {
  [key: string]: any;
}

export interface BaseProps {
  [key: string]: any;
}

export interface Path {}

const PROP_REGEX = /<([a-zA-Z0-9]+)>/g;

type DynamicDataPath = (
  data: { [key: string]: string },
  props: { [key: string]: string }
) => string;

interface DataPathStructure {
  name: string;
  vars?: string[];
  path: string | DynamicDataPath;
}

/**
 * Return data paths either as string or ready for injecting props
 * Ordered based on their dependencies between themselves
 * @param data the data paths to be processed
 */
function getOrderedDataPaths(data: BaseData): DataPathStructure[] {
  const paths = Object.keys(data).reduce(
    (acc, x: string) => {
      if (data[x].indexOf('/') === 0) {
        const vars: string[] = [];
        data[x].replace(PROP_REGEX, (_a: any, b: string, _c: any, _d: any) => {
          if (!vars.includes(b)) {
            vars.push(b);
          }
        });
        if (vars.length === 0) {
          acc.push({
            name: x,
            path: data[x]
          });
        } else {
          acc.push({
            name: x,
            vars,
            path: (vars, props) => {
              let isInvalid = false;
              const path = data[x].replace(
                PROP_REGEX,
                (_a: any, b: string, _c: any, _d: any) => {
                  const value = vars[b] || props[b];
                  if (typeof value !== 'string' || value.length === 0) {
                    isInvalid = true;
                    return;
                  }
                  return value;
                }
              );
              return isInvalid ? undefined : path;
            }
          });
        }
      }
      return acc;
    },
    [] as DataPathStructure[]
  );

  const orderedPaths = paths.sort((a, b) => {
    if (b.vars && b.vars.includes(a.name)) {
      return -1;
    } else {
      return 1;
    }
  });

  return orderedPaths;
}

/**
 * Processes data bindings and figures out what properties should be
 * provided to the component at run-time
 * @param data the data schema containing paths and props
 */
function getPropsStructure(
  data: BaseData
): {
  external: string[];
  internal: string[];
  links: { [key: string]: string };
} {
  const types = Object.keys(data).reduce(
    (acc, x: string) => {
      if (data[x].indexOf('/') === 0) {
        acc.paths.push(x);
      } else if (data[x].indexOf('<') === 0) {
        const prop = data[x].replace('<', '').replace('>', '');
        acc.externalProps.push(prop);
        acc.internalProps.push(x);
        acc.links[x] = prop;
      }
      return acc;
    },
    {
      internalProps: [] as string[],
      externalProps: [] as string[],
      links: {} as { [key: string]: string },
      paths: [] as string[]
    }
  );

  const usedProps = types.paths.reduce(
    (acc, x) => {
      data[x].replace(PROP_REGEX, (_a: any, b: string, _c: any, _d: any) => {
        if (
          acc.indexOf(b) === -1 &&
          !types.paths.includes(b) &&
          !types.internalProps.includes(b) &&
          b !== 'viewId' &&
          b !== 'viewPath'
        ) {
          acc.push(b);
        }
      });
      return acc;
    },
    [] as string[]
  );

  return {
    external: types.externalProps.concat(usedProps),
    internal: types.internalProps,
    links: types.links
  };
}

const state: Schema = {
  foos: {
    ids: ['id1', 'id2'],
    list: {
      id1: {
        id: 'id1',
        name: 'Foo 1'
      },
      id2: {
        id: 'id2',
        name: 'Foo 2'
      }
    }
  }
} as Schema;

const DB: DB = dbFn(state);
const db = DB;

export { DB };
// (window as any).db = DB;

// FEAT: Rollback mechanism

export function view<
  D extends BaseData,
  S extends BaseState,
  P extends BaseProps
>(component: {
  args: GenericState;
  defaultProps?: GenericState;
  fn: React.FunctionComponent<S>;
}): React.ComponentClass<P, S> {
  const db = window.db;
  const data = component.args;
  const view = component.fn;
  const defaultProps = component.defaultProps;

  // This needs to be here to catch errors
  class Component extends React.Component<S> {
    render() {
      return view(this.props);
    }
  }

  return class Wrapper extends React.Component<P, S> {
    static defaultProps = {};
    propsMap: { [key: string]: string } = {};
    internalProps: string[] = [];
    propLinks: { [key: string]: string } = {};
    dataMap: DataPathStructure[] = [];
    dataListeners: { [key: string]: { (): void } } = {};
    constructor(props: P) {
      super(props);
      const propsStructure = getPropsStructure(data);
      const receivedProps = propsStructure.external.reduce(
        (acc, x) => {
          if (props[x] !== undefined) {
            acc[x] = props[x];
          }
          return acc;
        },
        {} as BaseProps
      );
      this.propsMap = Object.assign(defaultProps || {}, receivedProps);
      this.internalProps = propsStructure.internal;
      this.propLinks = propsStructure.links;
      this.dataMap = getOrderedDataPaths(data);
      this.state = this.getState();
      this.listenOnState();
    }

    componentDidMount() {
      // console.log('Component mounted');
    }
    componentWillUnmount() {
      this.unsubscribeDataListeners();
    }

    shouldComponentUpdate(nextProps: any, nextState: any) {
      if (!isEqual(nextProps, this.props)) {
        this.propsMap = nextProps;
        this.setState(this.getState());
        // TODO: Remove this - this.setState is async!
        setTimeout(() => {
          this.listenOnState();
        });
      }
      return true;
    }

    componentDidUpdate(prevProps: P, prevState: S) {
      prevProps;
      prevState;
    }
    // TODO: Figure out how to catch errors that originate from handlers
    componentDidCatch(error: Error, info: React.ErrorInfo) {
      // console.log('Error error', error, info);
    }

    static getDerivedStateFromError(e: any) {
      return {
        hasError: true,
        errorMessage: e.message
      } as S;
    }

    unsubscribeDataListeners() {
      Object.keys(this.dataListeners).forEach(x => {
        this.dataListeners[x]();
      });
    }

    listenOnPath(name: string, path: string) {
      const unsubscriber = db.on(path, (x: any) => {
        this.setState({
          [name]: x
        });
        this.dataMap.forEach(y => {
          if (y.name === name) {
            return;
          }
          if (y.vars && y.vars.includes(name) && typeof y.path === 'function') {
            this.unsubscribeDataListener(y.name);
            const path = y.path(this.state, this.propsMap);
            if (path !== undefined) {
              this.listenOnPath(y.name, path);
            }
          }
        });
      });
      this.dataListeners[name] = unsubscriber;
    }

    unsubscribeDataListener(name: string) {
      if (this.dataListeners[name]) {
        this.dataListeners[name]();
        delete this.dataListeners[name];
      }
    }

    // TODO: Compute dyanmic paths that should get changed
    // when other paths are changed
    listenOnState() {
      this.unsubscribeDataListeners();
      this.dataMap.forEach(x => {
        if (typeof x.path === 'string') {
          this.listenOnPath(x.name, x.path);
        } else {
          // These should be deffered until data is available
          const path = x.path(this.state, this.propsMap);
          if (path !== undefined) {
            this.listenOnPath(x.name, path);
          }
        }
      });
    }

    getState() {
      const state: any = {
        hasError: false
      } as S;
      this.internalProps.forEach(x => {
        state[x] = this.propsMap[this.propLinks[x]];
      });

      this.dataMap.forEach(x => {
        if (typeof x.path === 'string') {
          state[x.name] = db.get(x.path);
        } else {
          const path = x.path(state, this.propsMap);
          if (path !== undefined) {
            state[x.name] = db.get(path);
          }
        }
      });
      return state;
    }

    render() {
      if (this.state.hasError) {
        return (
          <div className="error">
            <p>An error occured:</p>
            <div className="errorMessage">{this.state.errorMessage}</div>
          </div>
        );
      }
      return <Component {...this.state} />;
    }
  };
}

// TopLevel{
//   ErrorManagement,
//   propsManagement
// }

// MidLevel{
//   ChildSelection,
//   StateManagement,
//   ListenerManagement
// }

// LowLevel{
//   Rendering
// }
