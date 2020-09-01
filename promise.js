/**
 * 该有属性：status: pendding、fulfilled、rejected、value、
 * 方法:then、resolve、reject、done
 */

class CreatPromise {
    constructor(callback) {
        // 状态初始化
        this.status = 'pendding'
        this.value = undefined
        this.deferred = []
        // 调用callback，resolve和reject方法作为参数传入
        callback && callback(this.resolve.bind(this), this.reject.bind(this))
    }

    // 模拟promise微任务(可以用MutationObserver实现，这里展示就没用了)
    pushMicroTask (fn) {
        setTimeout(() => {
            fn()
        }, 0);
    }

    resolve(value) {
        this.pushMicroTask(() => {
            if (this.status !== 'pendding') return
            this.status = 'fulfilled'
            this.value = value
            this.done()
        });
    }

    reject(value) {
        this.pushMicroTask(() => {
            if (this.status !== 'pendding') return
            this.status = 'rejected'
            this.value = value
            this.done()
        });
    }

    then(success, fail) {
        const promise = new CreatPromise()
        // 回调信息
        const item = {
            success,
            fail,
            promise
        }
        this.deferred.push(item)
        // 当前promise状态已完成，则立即执行回调
        if (this.status === 'fulfilled' || this.status === 'rejected') this.pushMicroTask(this.done.bind(this))
        return promise
    }

    done() {
        if (this.status === 'pendding' || this.deferred.length === 0) return
        const _deferred = this.deferred
        this.deferred = []
        for (let i of _deferred) {
            let { success, fail, promise } = i
            let _promise
            /**
             * 执行回调，如果回调函数有报错，则promise状态变为rejected，继续处理后面的deferred
             */
            if (this.status === 'fulfilled' && success) {
                try {
                    _promise = success(this.value)
                } catch(err) {
                    promise.reject(err)
                    return
                }
            } else if (this.status === 'rejected' && fail) {
                try {
                    _promise = fail(this.value)
                } catch(err) {
                    promise.reject(err)
                    return
                }
            }

            /**
             * 如果回调函数返回值是promise实例,则后面的回调信息存于返回的promise实例
             * 返回值不为promise实例分两种情况
             * 1:当前promise(this)状态为rejected且有fail函数,则promise状态变为fulfilled.后面的deferred交由promise处理
             * 2.当前primise(this)状态为fulfilled或rejected，则后面的deferred还是交由当前promise处理
             */
            if (typeof _promise === 'object' && _promise instanceof CreatPromise) {
                _promise.deferred = promise.deferred
            } else if (this.status === 'rejected' && fail) {
                promise.resolve(_promise)
            } else if (this.status === 'fulfilled' || this.status === 'rejected') {
                this.deferred = this.deferred.concat(promise.deferred)
                this.value = _promise || this.value
            }
        }
        // 如果deferred不为空，继续执行
        if (this.deferred.length > 0) this.pushMicroTask(this.done.bind(this))
    }

    catch(callback) {
        return this.then(null, callback)
    }

    finally(callback) {
        return this.then(callback, callback)
    }
}

CreatPromise.resolve = function(value) {
    // 如果参数是promise实例，则原封不动返回该实例
    if (value instanceof CreatPromise) return value
    // 如果参数是个thenable对象,则将这个对象转为 Promise 对象，然后就立即执行thenable对象的then方法。
    if (typeof value === 'object' || typeof value === 'function') {
        const then = value.then
        if (typeof then === 'function') {
            return new CreatPromise(then.bind(value))
        }
    }
    return new CreatPromise((resolve) => resolve(value))
}

CreatPromise.reject = function(error) {
    // reject与resolve不同，会原封不动地作为reject的理由，变成后续方法的参数
    return new CreatPromise((resolve, reject) => reject(error))
}

CreatPromise.all = function(queue) {
    let res = [], count = queue.length;
    return new CreatPromise((_resolve, _reject) => {
        // 循环执行队列
        for (let i = 0; i < queue.length; i++) {
            CreatPromise.resolve(queue[i])
            .then((r) => {
                count--
                res[i] = r
                if (count === 0) _resolve(res)
            }).catch(_reject)
        }
    })
}

CreatPromise.race = function(queue) {
    return new CreatPromise((_resolve, _reject) => {
        // 循环执行队列
        for (let i = 0; i < queue.length; i++) {
            if ((typeof queue[i] === 'object' || typeof queue[i] === 'function') && queue[i].then) {
                // 如果是promise参数和thenable对象，则需要调用resolve方法
                CreatPromise.resolve(queue[i])
                .then(_resolve).catch(_reject)
            } else {
                _resolve(queue[i])
            }
            
        }
    })
}

window.verification = {
    // 验证promise与setTimeout执行顺序,接受参数native,true为使用原生promise，false为使用自己写的
    'PrintOrder': function(native = false) {
        const _promise = native ? Promise : CreatPromise
        console.log(1)
        setTimeout(() => {
            console.log(6)
        }, 0);
        new _promise((resolve, reject) => {
            console.log(2)
            resolve(5)
            console.log(3)
        }).then((res) => {
            setTimeout(() => {
                console.log(7)
            }, 0)
            console.log(4)
            return res
        }).then((res) => {
            return new _promise((resolve) => {
                console.log(res)
                setTimeout(() => {
                    resolve(8)
                }, 100);
            })
        }).then((res) => {
            console.log(res)
        })
    },
    // 验证内部报错是否会被最近一个fail函数捕获
    'InternalError': function(native = false) {
        const _promise = native ? Promise : CreatPromise
        _promise.reject('first reject').then(() => {}, (e) => {
            console.log(e)
        }).then(() => {
            console.log('first resolve')
            throw Error('throw Error')
        }).catch((e) => {
            console.log(e)
            return new _promise((resolve, reject) => {
                setTimeout(() => {
                    reject('catch done')
                }, 1000);
            })
        }).catch((e) => {
            console.log(e)
            return new _promise((resolve, reject) => {
                a.b
                setTimeout(() => {
                    resolve()
                }, 1000);
            })
        }).catch((e) => {
            console.log(e)
        })
    },
    // 验证all
    'All': function (native = false) {
        const _promise = native ? Promise : CreatPromise
        function a(){
            return new _promise((resolve, reject) => setTimeout(() => {
                resolve(111)
            }, 1000))
        }
        function b() {
            return new _promise((resolve) => setTimeout(() => {
                console.log('bbb')
                resolve(11)
            }, 2000))
        }
        function c() {
            console.log(222)
            return 'ccc'
        }
        function d() {
            return {
                then: function(resolve) {
                    resolve('dddd')
                }
            }
        }
        _promise.all([
            a(),
            b(),
            c,
            d()
        ]).then((res) => {console.log(res)})
        .catch((e) => console.log(e))
    },
    // 验证all
    'Race': function (native = false) {
        const _promise = native ? Promise : CreatPromise
        function a(){
            return new _promise((resolve, reject) => setTimeout(() => {
                console.log('aaa')
                resolve(111)
            }, 1000))
        }
        function b() {
            return new _promise((resolve) => setTimeout(() => {
                console.log('bbb')
                resolve(11)
            }, 2000))
        }
        function c() {
            console.log('ccccc')
            return 'ccc'
        }
        function d() {
            return {
                then: function(resolve) {
                    resolve('dddd')
                    console.log('dddd')
                }
            }
        }
        _promise.race([
            a(),
            b(),
            d(),
            c(),
        ]).then((res) => {console.log(res)})
        .catch((e) => console.log(e))
    }
}